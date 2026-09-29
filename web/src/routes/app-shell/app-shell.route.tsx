import { Outlet, useMatch } from "react-router";
import { TransferTray } from "~/lib/transfers/TransferTray";
import { AppSidebar, BottomNav, Wordmark } from "./components/AppNavigation";

// Navigation and transfer tracking persist across the Library and Storage.
export default function AppShellRoute() {
	const current = useMatch("/storage") ? "storage" : "library";
	return (
		<div className="app-shell">
			<a className="skip-link" href="#main-content">
				Skip to content
			</a>
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
