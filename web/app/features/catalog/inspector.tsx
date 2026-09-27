import { Check, Copy, Download, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router";

import type { Entry, FileEntry, FolderEntry } from "../../../src/lib/api/api-types.js";
import { useOriginalDownload } from "../transfers/transfer-controls.js";
import { catalogHref, entryKind, formatBytes, formatExactBytes, formatFullDate } from "./catalog-data.js";
import { EntryIcon } from "./entry-icon.js";
import { FilePreview } from "./file-preview.js";
import {
  closeInspector,
  inspectorView,
  readDockedOpen,
  settleInspector,
  toggleEntry,
  toggleInspector,
  viewerStorage,
  writeDockedOpen,
  type InspectorState,
} from "./inspector-state.js";

// Matches the shell breakpoint in app.css: the sidebar and a docked inspector need this width.
const wideScreen = "(min-width: 1100px)";

function subscribeToWidth(notify: () => void) {
  const query = window.matchMedia(wideScreen);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function useDocked() {
  return useSyncExternalStore(subscribeToWidth, () => window.matchMedia(wideScreen).matches, () => true);
}

export type Inspector = ReturnType<typeof useInspector>;

export function useInspector(folder: FolderEntry, children: readonly Entry[]) {
  const docked = useDocked();
  const [state, setState] = useState<InspectorState>(() => ({
    dockedOpen: readDockedOpen(viewerStorage()),
    entryId: null,
    folderId: folder.id,
    overlayOpen: false,
  }));
  const [layout, setLayout] = useState({ docked, folderId: folder.id });
  const [restorePending, setRestorePending] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const focusRequest = useRef(false);
  const toggleButton = useRef<HTMLButtonElement>(null);
  // Settle during render so a stale drawer or sheet never mounts, not even for one frame.
  if (layout.docked !== docked || layout.folderId !== folder.id) {
    setLayout({ docked, folderId: folder.id });
    if (state.overlayOpen) setRestorePending(true);
    setState(settleInspector(state, folder.id));
  }
  useEffect(() => writeDockedOpen(viewerStorage(), state.dockedOpen), [state.dockedOpen]);
  // After the close commits: a modal dialog keeps the page inert until it is gone.
  useEffect(() => {
    if (!restorePending) return;
    setRestorePending(false);
    const target = opener.current;
    opener.current = null;
    // The opener can vanish (a folder reloads); the toolbar toggle is always there.
    (target?.isConnected ? target : toggleButton.current)?.focus();
  }, [restorePending]);
  const view = inspectorView(state, folder, children, docked);

  function close() {
    setState(closeInspector(state, docked));
    setRestorePending(true);
  }

  // Whatever was pressed last, opening or closing, is where focus comes back to.
  function apply(next: InspectorState, trigger: HTMLElement) {
    opener.current = trigger;
    if (!inspectorView(next, folder, children, docked).open) return close();
    focusRequest.current = true;
    setState(next);
  }

  return {
    ...view,
    close,
    docked,
    focusRequest,
    isFolder: view.entry.id === folder.id,
    toggleButton,
    toggle: (trigger: HTMLElement) => apply(toggleInspector(state, folder, children, docked), trigger),
    toggleEntry: (entryId: string, trigger: HTMLElement) => apply(toggleEntry(state, folder, children, docked, entryId), trigger),
  };
}

/** A third column on wide screens; a modal drawer or bottom sheet below that. */
export function InspectorPanel({ id, inspector }: { id: string; inspector: Inspector }) {
  if (!inspector.open) return null;
  // Keyed by entry so status text and copy feedback never carry over to another entry.
  const details = <InspectorDetails
    entry={inspector.entry}
    focusRequest={inspector.focusRequest}
    isFolder={inspector.isFolder}
    key={inspector.entry.id}
    onClose={inspector.close}
  />;
  if (!inspector.docked) return <InspectorDialog id={id} onClose={inspector.close}>{details}</InspectorDialog>;
  return (
    <aside
      aria-label="Details"
      className="inspector inspector-docked"
      id={id}
      onKeyDown={(event) => {
        if (event.key === "Escape") inspector.close();
      }}
    >
      {details}
    </aside>
  );
}

function InspectorDialog({ children, id, onClose }: { children: ReactNode; id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Layout effect: the dialog must be modal before the details move focus into it.
  useLayoutEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  return (
    <dialog
      aria-label="Details"
      className="inspector inspector-dialog"
      id={id}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialog}
    >
      {children}
    </dialog>
  );
}

function InspectorDetails({ entry, focusRequest, isFolder, onClose }: {
  entry: Entry;
  focusRequest: RefObject<boolean>;
  isFolder: boolean;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const sectionId = useId();
  // Move focus only when someone asked to see details, never when a folder loads with it open.
  useEffect(() => {
    if (!focusRequest.current) return;
    focusRequest.current = false;
    heading.current?.focus();
  });
  const kind = entryKind(entry);
  const size = entry.kind === "file" ? entry.currentVersion.sizeBytes : null;
  return (
    <div className="inspector-content">
      <header className="inspector-header">
        <span className="inspector-icon"><EntryIcon family={kind.family} /></span>
        <div className="inspector-title">
          {isFolder ? <p className="eyebrow">This folder</p> : null}
          <h2 ref={heading} tabIndex={-1}>{entry.name}</h2>
          <p className="inspector-summary">{size ? `${kind.label} · ${formatBytes(size)}` : kind.label}</p>
        </div>
        <button aria-label="Close details" className="icon-button" onClick={onClose} title="Close details" type="button">
          <X aria-hidden="true" />
        </button>
      </header>
      {entry.kind === "file" ? <FilePreview entry={entry} key={entry.currentVersion.id} /> : null}
      <section aria-labelledby={sectionId} className="inspector-section">
        <h3 className="inspector-section-title" id={sectionId}>Details</h3>
        <dl className="inspector-fields">
          {size ? <div><dt>Size</dt><dd>{formatExactBytes(size)}</dd></div> : null}
          <div><dt>Modified</dt><dd><time dateTime={entry.updatedAt}>{formatFullDate(entry.updatedAt)}</time></dd></div>
          <div><dt>Created</dt><dd><time dateTime={entry.createdAt}>{formatFullDate(entry.createdAt)}</time></dd></div>
          <div>
            <dt>ID</dt>
            <dd className="inspector-id-row">
              <code className="inspector-id">{entry.id}</code>
              <CopyIdButton id={entry.id} />
            </dd>
          </div>
        </dl>
      </section>
      {entry.kind === "file" ? <FileActions entry={entry} /> : null}
      {entry.kind === "folder" && !isFolder ? (
        <div className="inspector-actions">
          <Link className="button secondary" to={catalogHref(entry.id)}>Open folder</Link>
        </div>
      ) : null}
    </div>
  );
}

function CopyIdButton({ id }: { id: string }) {
  const [result, setResult] = useState<"copied" | "failed">();
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }
  return (
    <>
      <button aria-label="Copy ID" className="icon-button" onClick={() => void copy()} title="Copy ID" type="button">
        {result === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span className="inspector-note" role="status">
        {result === "copied" ? "Copied" : result === "failed" ? "Couldn't copy. Select the ID to copy it." : ""}
      </span>
    </>
  );
}

function FileActions({ entry }: { entry: FileEntry }) {
  const { busy, download, status } = useOriginalDownload(entry.id, entry.name);
  return (
    <div className="inspector-actions">
      <button aria-busy={busy} className="button primary" disabled={busy} onClick={download} type="button">
        <Download aria-hidden="true" className="button-icon" />
        Download
      </button>
      <p className="inspector-note" role="status">{status}</p>
    </div>
  );
}
