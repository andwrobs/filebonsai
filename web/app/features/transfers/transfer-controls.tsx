import { useEffect, useState, useSyncExternalStore } from "react";
import { useRevalidator } from "react-router";
import { transfers, terminal } from "./transfer-store.js";
import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";

export function UploadControl({ parentId }: { parentId: string }) {
  return <label className="upload-control">Upload files
    <input type="file" multiple aria-label="Upload files" onChange={event => {
      for (const file of Array.from(event.target.files ?? [])) transfers.add(file, parentId);
      event.target.value = "";
    }} />
  </label>;
}

export function TransferPanel() {
  const items = useSyncExternalStore(transfers.subscribe, transfers.snapshot, transfers.snapshot);
  const revalidator = useRevalidator();
  const available = items.filter(item => item.upload?.state === "AVAILABLE").length;
  useEffect(() => { if (available) void revalidator.revalidate(); }, [available]);
  useEffect(() => {
    if (!items.some(item => !terminal(item.upload?.state))) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items]);
  if (!items.length) return null;
  return <section className="transfer-panel" aria-labelledby="transfers-heading">
    <h2 id="transfers-heading">Transfers</h2>
    <p>Uploads continue while you browse folders. Keep this tab open. Retry sends the whole file from byte zero.</p>
    <ul>{items.map(item => <li key={item.key}>
      <strong>{item.file.name}</strong>
      <p role="status">{item.message}</p>
      {item.busy ? <progress aria-label={`Upload ${item.file.name}`} /> : null}
      {!terminal(item.upload?.state) ? <div className="transfer-actions">
        <button className="secondary-button" disabled={item.busy} onClick={() => void transfers.run(item.key, "check")}>Check status</button>
        {(!item.busy && (!item.upload || ["INITIATED", "STAGED"].includes(item.upload.state))) ?
          <button className="secondary-button" onClick={() => void transfers.run(item.key, "continue")}>{item.upload?.state === "STAGED" ? "Finish upload" : "Retry from byte zero"}</button> : null}
        {((!item.busy && !item.upload) || (item.upload && ["INITIATED", "RECEIVING", "STAGED"].includes(item.upload.state))) ?
          <button className="secondary-button" onClick={() => void transfers.run(item.key, "cancel")}>Cancel upload</button> : null}
      </div> : null}
    </li>)}</ul>
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
  return <span className="download-control">
    <button className="secondary-button" disabled={busy} aria-label={`Download ${name}`} onClick={() => void download()}>{busy ? "Downloading…" : "Download original"}</button>
    {message ? <span role="status">{message}</span> : null}
  </span>;
}
