import { HardDrive, Library, type LucideIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";

import type { StorageSummary } from "../../../src/lib/api/api-types.js";
import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";
import { formatBytes } from "../catalog/catalog-data.js";
import { transfers } from "../transfers/transfer-store.js";

export type Destination = "library" | "storage";

function NavItem({ current, detail, icon: Icon, label, to }: {
  current: boolean;
  detail?: string;
  icon: LucideIcon;
  label: string;
  to: string;
}) {
  return (
    <Link aria-current={current ? "page" : undefined} className="nav-item" title={label} to={to}>
      <Icon aria-hidden="true" className="nav-icon" strokeWidth={1.75} />
      <span className="nav-text">
        <span className="nav-label">{label}</span>
        {detail ? <span className="nav-detail">{detail}</span> : null}
      </span>
    </Link>
  );
}

// The connection summary is a convenience; the Storage page owns loading and error states.
function useStorageDetail() {
  const [summary, setSummary] = useState<StorageSummary>();
  const available = useSyncExternalStore(transfers.subscribe, transfers.snapshot, transfers.snapshot)
    .filter((item) => item.upload?.state === "AVAILABLE").length;
  useEffect(() => {
    let current = true;
    filebonsaiService().getStorageSummary().then(
      (result) => { if (current && result.data) setSummary(result.data); },
      () => undefined,
    );
    return () => { current = false; };
  }, [available]);
  return summary ? `${summary.connection.displayName} · ${formatBytes(summary.usedBytes)}` : undefined;
}

export function Wordmark() {
  return (
    <Link aria-label="Filebonsai Library" className="wordmark" to="/">
      <span className="wordmark-mark" aria-hidden="true">F</span>
      <span className="wordmark-text" aria-hidden="true">Filebonsai</span>
    </Link>
  );
}

export function AppSidebar({ current }: { current: Destination }) {
  const storageDetail = useStorageDetail();
  return (
    <aside className="app-sidebar">
      <Wordmark />
      <nav aria-label="Main" className="sidebar-nav">
        <NavItem current={current === "library"} icon={Library} label="Library" to="/" />
        <div className="sidebar-footer">
          <NavItem current={current === "storage"} detail={storageDetail} icon={HardDrive} label="Storage" to="/storage" />
        </div>
      </nav>
    </aside>
  );
}

export function BottomNav({ current }: { current: Destination }) {
  return (
    <nav aria-label="Main" className="bottom-nav">
      <NavItem current={current === "library"} icon={Library} label="Library" to="/" />
      <NavItem current={current === "storage"} icon={HardDrive} label="Storage" to="/storage" />
    </nav>
  );
}
