import { Outlet, useMatch } from "react-router";
import { TransferTray } from "~/lib/transfers/TransferTray";
import { AppSidebar, BottomNav, Wordmark } from "./components/AppNavigation";

// Navigation and transfer tracking persist across the Library and Storage.
// Phones get a top bar and bottom navigation, `md` an icon rail, `wide` the sidebar.
export default function AppShellRoute() {
	const current = useMatch("/storage") ? "storage" : "library";
	return (
		<div
			className="min-h-dvh md:grid md:grid-cols-[var(--rail-width)_minmax(0,1fr)] wide:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
			data-app-shell
		>
			<a
				className="absolute top-2 left-2 z-50 -translate-y-[300%] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-none"
				href="#main-content"
			>
				Skip to content
			</a>
			<AppSidebar current={current} />
			<header className="sticky top-0 z-20 flex min-h-[calc(var(--mobile-bar-height)+env(safe-area-inset-top))] items-center border-b bg-muted pt-[env(safe-area-inset-top)] pr-[max(--spacing(2),env(safe-area-inset-right))] pl-[max(--spacing(2),env(safe-area-inset-left))] md:hidden">
				<Wordmark />
			</header>
			<main
				className="flex min-w-0 flex-col bg-card focus:outline-none max-md:min-h-[calc(100dvh-var(--mobile-bar-height))] max-md:pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]"
				id="main-content"
				tabIndex={-1}
			>
				<Outlet />
				<TransferTray />
			</main>
			<BottomNav current={current} />
		</div>
	);
}
