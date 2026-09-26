import { Outlet, useMatch } from "react-router";

import { AppSidebar, BottomNav, Wordmark } from "../features/shell/app-navigation.js";
import { TransferTray } from "../features/transfers/transfer-controls.js";

// Pathless layout: navigation and transfer tracking persist across Library and Storage.
export default function AppShell() {
  const current = useMatch("/storage") ? "storage" : "library";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <AppSidebar current={current} />
      <header className="mobile-bar">
        <Wordmark />
      </header>
      <main className="app-main" id="main-content" tabIndex={-1}>
        <Outlet />
        <TransferTray />
      </main>
      <BottomNav current={current} />
    </div>
  );
}
