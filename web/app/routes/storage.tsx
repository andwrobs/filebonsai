import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { filebonsaiService } from "../../src/lib/api/filebonsai-service.js";
import { formatBytes } from "../features/catalog/catalog-data.js";
import { capabilityRows, loadStorage, providerLabel, type StorageLoad } from "../features/storage/storage-data.js";

export function meta() {
  return [{ title: "Storage · Filebonsai" }, { name: "description", content: "Your configured Filebonsai storage." }];
}

// Loaded in the component: SPA mode allows a HydrateFallback only on the root route, and this page owns its
// loading, error, and unavailable states.
export default function Storage() {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StorageLoad | { status: "loading" }>({ status: "loading" });
  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    void loadStorage(filebonsaiService()).then((result) => {
      if (!current) return;
      if (result.status === "sign-in") void navigate("/sign-in", { replace: true });
      else setState(result);
    });
    return () => {
      current = false;
    };
  }, [attempt, navigate]);

  return (
    <div className="page" aria-busy={state.status === "loading"}>
        {state.status === "ready" ? (
          <StorageSummaryView maximumBytes={state.maximumBytes} summary={state.summary} />
        ) : state.status === "failed" ? (
          <div className="page-message" role="alert">
            <p className="eyebrow">{state.failure.kind === "unavailable" ? "Unavailable" : "Error"}</p>
            <h1>{state.failure.kind === "unavailable" ? "Storage details are unavailable" : "Could not load storage details"}</h1>
            <p>{state.failure.message}</p>
            {state.failure.requestId ? <p className="storage-note">Request ID: {state.failure.requestId}</p> : null}
            <div className="page-message-actions">
              <button className="button primary" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button>
              <Link className="button secondary" to="/">Return to Library</Link>
            </div>
          </div>
        ) : (
          <header className="page-toolbar">
            <div className="page-heading">
              <h1>Storage</h1>
              <p className="page-subtitle" role="status">Loading storage details…</p>
            </div>
          </header>
        )}
    </div>
  );
}

function StorageSummaryView({ summary, maximumBytes }: Extract<StorageLoad, { status: "ready" }>) {
  return (
    <>
      <header className="page-toolbar">
        <div className="page-heading">
          <h1>Storage <span className="badge">Read-only</span></h1>
          <p className="page-subtitle">The server operator configures storage; this page cannot change it.</p>
        </div>
      </header>

      <div className="storage-grid">
        <section className="storage-card" aria-labelledby="connection-heading">
          <h2 id="connection-heading">Connection</h2>
          <p className="storage-figure storage-name">{summary.connection.displayName}</p>
          <p className="storage-detail">{providerLabel(summary.connection.providerKind)}</p>
          <p className="storage-note">Credentials, bucket names, and server paths stay on the server.</p>
        </section>

        <section className="storage-card" aria-labelledby="usage-heading">
          <h2 id="usage-heading">Stored</h2>
          <p className="storage-figure">{formatBytes(summary.usedBytes)}</p>
          <p className="storage-detail">In files whose upload finished</p>
          <p className="storage-note">Uploads still in progress are not counted.</p>
        </section>

        <section className="storage-card" aria-labelledby="limits-heading">
          <h2 id="limits-heading">Upload limit</h2>
          <p className="storage-figure">{maximumBytes ? formatBytes(maximumBytes) : "Unavailable"}</p>
          <p className="storage-detail">Largest file per upload</p>
          <p className="storage-note">
            {maximumBytes
              ? "Larger files are refused before anything is sent."
              : "The limit could not be read right now. The server still enforces it when you upload."}
          </p>
        </section>
      </div>

      <section className="storage-capabilities" aria-labelledby="capabilities-heading">
        <h2 className="section-title" id="capabilities-heading">How this connection handles files</h2>
        <ul className="capability-list">
          {capabilityRows(summary).map((row) => (
            <li key={row.label}>
              <span className={`capability-state ${row.enabled ? "yes" : "no"}`}>{row.enabled ? "Yes" : "No"}</span>
              <div>
                <strong>{row.label}</strong>
                <p>{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
