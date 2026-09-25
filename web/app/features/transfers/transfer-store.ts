import { filebonsaiService, type FilebonsaiService } from "../../../src/lib/api/filebonsai-service.js";
import type { components } from "../../../src/lib/api/generated/schema.js";
import { formatBytes } from "../catalog/catalog-data.js";

type Upload = components["schemas"]["UploadResponse"];
export interface Transfer {
  key: string;
  file: File;
  parentId: string;
  upload?: Upload;
  /** Rejected by the client-side size preflight; nothing was sent to the server. */
  refused?: boolean;
  busy: boolean;
  message: string;
}
const labels: Record<Upload["state"], string> = {
  INITIATED: "Ready to send. Retry sends the whole file from byte zero.",
  RECEIVING: "The server is still receiving a body. Check status before retrying.",
  STAGED: "Body verified. Ready to finish.",
  FINALIZING: "Finalizing. Availability is not confirmed yet.",
  RECONCILING: "Completion is uncertain. The server is reconciling this upload.",
  AVAILABLE: "Available in your Library.",
  CANCELLED: "Upload cancelled.", EXPIRED: "Upload expired. Select the file again to start a new upload.",
  FAILED: "Upload failed. Select the file again to start a new upload.",
};
export const terminal = (state?: Upload["state"]) => !!state && ["AVAILABLE", "CANCELLED", "EXPIRED", "FAILED"].includes(state);
export const settled = (item: Transfer) => !!item.refused || terminal(item.upload?.state);

const decimal = /^(0|[1-9][0-9]*)$/;
export function oversizeMessage(size: bigint, limit: bigint) {
  let [actual, allowed] = [formatBytes(size.toString()), formatBytes(limit.toString())];
  // Rounded units can read as equal just over the limit, so fall back to exact bytes.
  if (actual === allowed) [actual, allowed] = [`${size.toLocaleString()} bytes`, `${limit.toLocaleString()} bytes`];
  return `Too large to upload: ${actual} is over the ${allowed} limit. Nothing was sent.`;
}

// Owned outside route components: navigation only changes observers, never transfer ownership.
export class TransferStore {
  #items: Transfer[] = [];
  #epochs = new Map<string, number>();
  #listeners = new Set<() => void>();
  #limit?: Promise<bigint | undefined>;
  constructor(private service: FilebonsaiService = filebonsaiService()) {}
  // The preflight only saves a doomed request; an unknown limit leaves the decision to the server.
  async #maximumBytes() {
    const read = this.#limit ??= this.service.getUploadLimits().then(
      ({ data }) => data && decimal.test(data.maximumBytes) ? BigInt(data.maximumBytes) : undefined,
      () => undefined);
    const limit = await read;
    if (limit === undefined && this.#limit === read) this.#limit = undefined;
    return limit;
  }
  // A refusal is final, so confirm a cached limit against a fresh read before refusing.
  async #refusingLimit(size: bigint) {
    const cached = await this.#maximumBytes();
    if (cached === undefined || size <= cached) return undefined;
    this.#limit = undefined;
    const fresh = await this.#maximumBytes();
    return fresh !== undefined && size > fresh ? fresh : undefined;
  }
  snapshot = () => this.#items;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #patch(key: string, patch: Partial<Transfer>) {
    this.#items = this.#items.map(item => item.key === key ? { ...item, ...patch } : item);
    this.#listeners.forEach(listener => listener());
  }
  add(file: File, parentId: string) {
    const key = crypto.randomUUID();
    this.#items = [...this.#items, { key, file, parentId, busy: false, message: "Waiting to begin…" }];
    void this.run(key, "continue");
    return key;
  }
  async run(key: string, action: "continue" | "check" | "cancel") {
    const item = this.#items.find(item => item.key === key);
    if (!item || (item.busy && action !== "cancel") || settled(item)) return;
    const epoch = (this.#epochs.get(key) ?? 0) + 1;
    this.#epochs.set(key, epoch);
    this.#patch(key, { busy: true, message: "Checking upload…" });
    const accept = (result: { data?: Upload; response: Response }) => {
      if (this.#epochs.get(key) !== epoch) throw new Error("Superseded operation");
      // The server may have been reconfigured since the limit was read; read it again next time.
      if (result.response.status === 413) this.#limit = undefined;
      if (!result.data) throw new Error(result.response.status === 401 || result.response.status === 403
        ? "Session unavailable. Sign in again, then check status."
        : `Request failed (${result.response.status}). Check status before continuing.`);
      this.#patch(key, { upload: result.data, message: labels[result.data.state] });
      return result.data;
    };
    try {
      const csrf = await this.service.refreshCsrf();
      if (!csrf.data) throw new Error("Session unavailable. Sign in again, then check status.");
      if (!item.upload) {
        const limit = await this.#refusingLimit(BigInt(item.file.size));
        if (this.#epochs.get(key) !== epoch) return;
        if (limit !== undefined) {
          this.#patch(key, { refused: true, message: oversizeMessage(BigInt(item.file.size), limit) });
          return;
        }
      }
      // Reuse the same key after a lost begin response to recover the reserved intent.
      let upload = accept(item.upload ? await this.service.getUpload(item.upload.id) : await this.service.beginUpload({
        parentId: item.parentId, name: item.file.name, sizeBytes: String(item.file.size),
      }, key));
      if (action === "cancel" && ["INITIATED", "RECEIVING", "STAGED"].includes(upload.state)) {
        accept(await this.service.cancelUpload(upload.id));
      } else if (action === "continue") {
        if (upload.state === "INITIATED") {
          this.#patch(key, { message: "Sending whole file and awaiting body verification…" });
          upload = accept(await this.service.sendUpload(upload.id, item.file));
        }
        if (upload.state === "STAGED") {
          this.#patch(key, { message: "Finalizing. Availability is not confirmed yet…" });
          accept(await this.service.completeUpload(upload.id));
        }
      }
    } catch (error) {
      if (this.#epochs.get(key) !== epoch) return;
      this.#patch(key, { message: error instanceof TypeError
        ? "Connection lost. The outcome is unknown. Check status before continuing."
        : error instanceof Error ? error.message : "Outcome unknown. Check status." });
    } finally { if (this.#epochs.get(key) === epoch) this.#patch(key, { busy: false }); }
  }
}
export const transfers = new TransferStore();
