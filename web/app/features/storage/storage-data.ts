import type { ApiError, StorageSummary } from "../../../src/lib/api/api-types.js";
import type { FilebonsaiService } from "../../../src/lib/api/filebonsai-service.js";

const providers: Record<string, string> = {
  local: "Local disk on the server",
  r2: "Cloudflare R2",
};

// providerKind is an open vocabulary, so an unknown value is shown rather than hidden.
export function providerLabel(kind: string) {
  return providers[kind] ?? kind;
}

export interface CapabilityRow {
  label: string;
  enabled: boolean;
  detail: string;
}

export function capabilityRows({ capabilities }: StorageSummary): CapabilityRow[] {
  return [
    {
      label: "Verified uploads",
      enabled: capabilities.sha256Verification,
      detail: capabilities.sha256Verification
        ? "Size and SHA-256 are checked before a file becomes available."
        : "Uploads are not checked by SHA-256 before they become available.",
    },
    {
      label: "Resumable uploads",
      enabled: capabilities.resumableUploads,
      detail: capabilities.resumableUploads
        ? "An interrupted upload continues where it stopped."
        : "An interrupted upload is sent again from byte zero.",
    },
    {
      label: "Partial downloads",
      enabled: capabilities.rangeDownloads,
      detail: capabilities.rangeDownloads
        ? "Downloads can fetch part of a file."
        : "Downloads always send the whole original.",
    },
  ];
}

export interface StorageFailure {
  kind: "unavailable" | "error";
  message: string;
  requestId?: string;
}

export type StorageLoad =
  | { status: "ready"; summary: StorageSummary; maximumBytes: string | null }
  | { status: "failed"; failure: StorageFailure }
  | { status: "sign-in" };

export async function loadStorage(service: FilebonsaiService): Promise<StorageLoad> {
  // The page still describes the connection when only the limit read fails.
  const limits = service.getUploadLimits().catch(() => undefined);
  let summary;
  try {
    summary = await service.getStorageSummary();
  } catch {
    return { status: "failed", failure: storageFailure(undefined) };
  }
  if (!summary.data) {
    if (summary.response.status === 401) return { status: "sign-in" };
    return { status: "failed", failure: storageFailure(summary.response.status, summary.error) };
  }
  return { status: "ready", summary: summary.data, maximumBytes: (await limits)?.data?.maximumBytes ?? null };
}

// "Unavailable": no response, a gateway/unavailable status, or a body that is not an API error.
// "Error": the API answered with a structured error.
export function storageFailure(status: number | undefined, error?: ApiError): StorageFailure {
  if (status === undefined || status === 502 || status === 503 || status === 504 || !error?.code) {
    return { kind: "unavailable", message: "The server is not responding normally. Try again in a moment." };
  }
  return {
    kind: "error",
    message: error.message || `The server returned ${status}.`,
    requestId: error.requestId || undefined,
  };
}
