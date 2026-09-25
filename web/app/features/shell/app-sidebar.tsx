import { Link } from "react-router";

export function AppSidebar({ current }: { current: "library" | "storage" }) {
  const link = (to: string, label: string, page: typeof current) => (
    <Link aria-current={current === page ? "page" : undefined} className={`sidebar-link${current === page ? " current" : ""}`} to={to}>
      {label}
    </Link>
  );
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <Link className="brand" to="/">
        Filebonsai
      </Link>
      <nav>
        {link("/", "Library", "library")}
        <span className="sidebar-link muted">Recent</span>
        <span className="sidebar-link muted">Shared</span>
        <span className="sidebar-link muted">Archive</span>
        {link("/storage", "Storage", "storage")}
      </nav>
      <p className="sidebar-note">Your storage stays in your control.</p>
    </aside>
  );
}
