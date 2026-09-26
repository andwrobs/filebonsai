import { ChevronDown, ChevronUp, Download, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRevalidator } from "react-router";
import { transfers, settled } from "./transfer-store.js";
import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";

// "toolbar" is the labelled page action; "fab" is the floating phone action; "inline" sits in empty states.
export function UploadControl({ parentId, variant = "toolbar" }: { parentId: string; variant?: "toolbar" | "fab" | "inline" }) {
  const input = useRef<HTMLInputElement>(null);
  const className = variant === "fab" ? "fab" : variant === "toolbar" ? "button primary toolbar-upload" : "button primary";
  return <>
    <button aria-label={variant === "fab" ? "Upload files" : undefined} className={className} onClick={() => input.current?.click()} type="button">
      <Upload aria-hidden="true" className="button-icon" strokeWidth={2} />
      {variant === "fab" ? null : <span>Upload</span>}
    </button>
    <input ref={input} type="file" multiple hidden tabIndex={-1} aria-label="Upload files" onChange={event => {
      for (const file of Array.from(event.target.files ?? [])) transfers.add(file, parentId);
      event.target.value = "";
    }} />
  </>;
}

export function TransferTray() {
  const items = useSyncExternalStore(transfers.subscribe, transfers.snapshot, transfers.snapshot);
  const revalidator = useRevalidator();
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const available = items.filter(item => item.upload?.state === "AVAILABLE").length;
  const active = items.filter(item => !settled(item)).length;
  const attention = items.filter(item => item.refused || ["FAILED", "EXPIRED"].includes(item.upload?.state ?? "")).length;
  useEffect(() => { if (available) void revalidator.revalidate(); }, [available]);
  // Open when new work starts or needs a decision; fold away once every upload settled cleanly.
  const previous = useRef({ active: 0, attention: 0 });
  useEffect(() => {
    if (active > previous.current.active || attention > previous.current.attention) setExpanded(true);
    else if (!active && !attention) setExpanded(false);
    previous.current = { active, attention };
  }, [active, attention]);
  // Publish the tray height so floating actions can sit above it instead of covering it.
  const tray = useRef<HTMLElement>(null);
  const shown = items.length > 0;
  useEffect(() => {
    const node = tray.current;
    const shell = node?.closest<HTMLElement>(".app-shell");
    if (!node || !shell) return;
    const observer = new ResizeObserver(() => shell.style.setProperty("--tray-height", `${node.offsetHeight}px`));
    observer.observe(node);
    return () => { observer.disconnect(); shell.style.removeProperty("--tray-height"); };
  }, [shown]);
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
  if (!shown) return null;
  return <section ref={tray} className="transfer-tray" data-expanded={expanded} aria-labelledby="transfers-heading">
    <header className="transfer-tray-header">
      <h2 id="transfers-heading">Transfers</h2>
      <p className="transfer-summary" role="status">{[
        active ? `${active} in progress` : "",
        attention ? `${attention} need attention` : "",
        items.length - active - attention ? `${items.length - active - attention} finished` : "",
      ].filter(Boolean).join(" · ")}</p>
      <button aria-controls={bodyId} aria-expanded={expanded} className="icon-button" onClick={() => setExpanded(value => !value)} type="button">
        {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        <span className="visually-hidden">{expanded ? "Hide transfers" : "Show transfers"}</span>
      </button>
    </header>
    <div className="transfer-tray-body" hidden={!expanded} id={bodyId}>
      <p className="transfer-note">Uploads continue while you browse folders. Keep this tab open. Retry sends the whole file from byte zero.</p>
      <ul>{items.map(item => <li key={item.key}>
        <strong>{item.file.name}</strong>
        <p role="status">{item.message}</p>
        {item.busy ? <progress aria-label={`Upload ${item.file.name}`} /> : null}
        {!settled(item) ? <div className="transfer-actions">
          <button className="button secondary" disabled={item.busy} onClick={() => void transfers.run(item.key, "check")}>Check status</button>
          {(!item.busy && (!item.upload || ["INITIATED", "STAGED"].includes(item.upload.state))) ?
            <button className="button secondary" onClick={() => void transfers.run(item.key, "continue")}>{item.upload?.state === "STAGED" ? "Finish upload" : "Retry from byte zero"}</button> : null}
          {((!item.busy && !item.upload) || (item.upload && ["INITIATED", "RECEIVING", "STAGED"].includes(item.upload.state))) ?
            <button className="button secondary" onClick={() => void transfers.run(item.key, "cancel")}>Cancel upload</button> : null}
        </div> : null}
      </li>)}</ul>
    </div>
  </section>;
}

export function DownloadControl({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    setBusy(true); setMessage("");
    try {
      const result = await filebonsaiService().downloadOriginal(id);
      if (!result.data) throw new Error("Original unavailable. Check your session and try again.");
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = name;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Original sent to your browser for saving.");
    } catch { setMessage("Download failed. Check your session or connection and try again."); }
    finally { setBusy(false); }
  }
  return <>
    <button aria-busy={busy} aria-label={`Download ${name}`} className="icon-button entry-action" disabled={busy} onClick={() => void download()} title="Download original" type="button">
      <Download aria-hidden="true" />
    </button>
    <span className="entry-status" role="status">{busy ? "Downloading…" : message}</span>
  </>;
}
