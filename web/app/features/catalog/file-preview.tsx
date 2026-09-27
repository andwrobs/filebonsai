import { useEffect, useId, useState } from "react";

import type { FileEntry } from "../../../src/lib/api/api-types.js";
import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";
import { formatBytes } from "./catalog-data.js";
import { previewPolicy, type PreviewPolicy } from "./preview-policy.js";

type PreviewState =
  | { kind: "loading" }
  | { kind: "image"; url: string }
  | { kind: "text"; content: string }
  | { kind: "failed" };

export function FilePreview({ entry }: { entry: FileEntry }) {
  const titleId = useId();
  const policy = previewPolicy(entry);
  return (
    <section aria-labelledby={titleId} className="inspector-section inspector-preview">
      <h3 className="inspector-section-title" id={titleId}>Preview</h3>
      {policy.kind === "unsupported" ? <p className="inspector-preview-message">Preview isn't available for this file type. Download the original to open it.</p> : null}
      {policy.kind === "too-large" ? <p className="inspector-preview-message">This file is over the {formatBytes(String(policy.maxBytes))} preview limit. Download the original to open it.</p> : null}
      {policy.kind === "image" || policy.kind === "text" ? <LoadedPreview entry={entry} policy={policy} /> : null}
    </section>
  );
}

function LoadedPreview({ entry, policy }: { entry: FileEntry; policy: Extract<PreviewPolicy, { kind: "image" | "text" }> }) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    setState({ kind: "loading" });
    async function load() {
      try {
        const result = await filebonsaiService().downloadOriginal(entry.id, controller.signal);
        if (!active) return;
        if (!result.data || result.data.size > policy.maxBytes) throw new Error("Preview unavailable");
        // The content endpoint is an attachment. Give only allow-listed extensions a safe type.
        const typed = new Blob([result.data], { type: policy.mimeType });
        if (policy.kind === "text") {
          const content = await typed.text();
          if (active) setState({ kind: "text", content });
        } else {
          objectUrl = URL.createObjectURL(typed);
          setState({ kind: "image", url: objectUrl });
        }
      } catch {
        if (active) setState({ kind: "failed" });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.id, entry.currentVersion.id, policy.kind, policy.maxBytes, policy.mimeType]);

  if (state.kind === "loading") return <p className="inspector-preview-message" role="status">Loading preview…</p>;
  if (state.kind === "failed") return <p className="inspector-preview-message" role="status">Preview couldn't be loaded. You can still download the original.</p>;
  if (state.kind === "text") return <pre className="inspector-preview-text">{state.content}</pre>;
  return <img alt={`Preview of ${entry.name}`} className="inspector-preview-image" onError={() => {
    URL.revokeObjectURL(state.url);
    setState({ kind: "failed" });
  }} src={state.url} />;
}
