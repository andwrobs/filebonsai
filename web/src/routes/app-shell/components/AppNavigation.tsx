import { useQuery } from "@tanstack/react-query";
import { HardDrive, Library, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { formatBytes } from "~/lib/format/bytes";
import { storageSummaryQuery } from "~/lib/storage/storage.query";

export type Destination = "library" | "storage";

function NavItem({
	current,
	detail,
	icon: Icon,
	label,
	to,
}: {
	current: boolean;
	detail?: string;
	icon: LucideIcon;
	label: string;
	to: string;
}) {
	return (
		<Link
			aria-current={current ? "page" : undefined}
			className="nav-item"
			title={label}
			to={to}
		>
			<Icon aria-hidden="true" className="nav-icon" strokeWidth={1.75} />
			<span className="nav-text">
				<span className="nav-label">{label}</span>
				{detail ? <span className="nav-detail">{detail}</span> : null}
			</span>
		</Link>
	);
}

// The connection summary is a convenience; the Storage page owns loading and
// error states. A finished upload refreshes it (lib/transfers/TransferTray).
function useStorageDetail() {
	const { data } = useQuery(storageSummaryQuery());
	return data
		? `${data.connection.displayName} · ${formatBytes(data.usedBytes)}`
		: undefined;
}

export function Wordmark() {
	return (
		<Link aria-label="Filebonsai Library" className="wordmark" to="/">
			<img alt="" className="wordmark-mark" src="/brand/filebonsai-mark.svg" />
			<img
				alt=""
				className="wordmark-text"
				src="/brand/filebonsai-wordmark.svg"
			/>
		</Link>
	);
}

export function AppSidebar({ current }: { current: Destination }) {
	const storageDetail = useStorageDetail();
	return (
		<aside className="app-sidebar">
			<Wordmark />
			<nav aria-label="Main" className="sidebar-nav">
				<NavItem
					current={current === "library"}
					icon={Library}
					label="Library"
					to="/"
				/>
				<div className="sidebar-footer">
					<NavItem
						current={current === "storage"}
						detail={storageDetail}
						icon={HardDrive}
						label="Storage"
						to="/storage"
					/>
				</div>
			</nav>
		</aside>
	);
}

export function BottomNav({ current }: { current: Destination }) {
	return (
		<nav aria-label="Main" className="bottom-nav">
			<NavItem
				current={current === "library"}
				icon={Library}
				label="Library"
				to="/"
			/>
			<NavItem
				current={current === "storage"}
				icon={HardDrive}
				label="Storage"
				to="/storage"
			/>
		</nav>
	);
}
