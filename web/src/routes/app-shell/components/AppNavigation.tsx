import { useQuery } from "@tanstack/react-query";
import { HardDrive, Library, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { formatBytes } from "~/lib/format/bytes";
import { storageSummaryQuery } from "~/lib/storage/storage.query";
import { cn } from "~/lib/ui/utils";

export type Destination = "library" | "storage";

// The sidebar collapses to an icon rail between `md` and `wide`; the bottom bar
// only shows on phones.
const navItem = {
	sidebar:
		"min-h-control gap-3 px-3 py-2 md:max-wide:h-touch md:max-wide:w-touch md:max-wide:justify-center md:max-wide:p-0",
	bottom:
		"mx-2 min-h-touch flex-col justify-center gap-0.5 p-1 text-xs aria-[current=page]:bg-transparent aria-[current=page]:text-primary-text",
};

function NavItem({
	current,
	detail,
	icon: Icon,
	label,
	placement,
	to,
}: {
	current: boolean;
	detail?: string;
	icon: LucideIcon;
	label: string;
	placement: keyof typeof navItem;
	to: string;
}) {
	return (
		<Link
			aria-current={current ? "page" : undefined}
			className={cn(
				"group/nav flex items-center rounded-md text-md font-medium text-foreground no-underline hover:bg-accent aria-[current=page]:bg-selection aria-[current=page]:font-semibold aria-[current=page]:text-selection-foreground",
				navItem[placement],
			)}
			title={label}
			to={to}
		>
			<Icon
				aria-hidden="true"
				className={placement === "bottom" ? "size-[1.375rem]" : "size-icon"}
				strokeWidth={1.75}
			/>
			<span
				className={cn(
					"grid min-w-0",
					placement === "sidebar" && "md:max-wide:sr-only",
				)}
			>
				<span>{label}</span>
				{detail ? (
					<span className="text-xs font-normal wrap-anywhere text-muted-foreground group-aria-[current=page]/nav:text-selection-foreground">
						{detail}
					</span>
				) : null}
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
		<Link
			aria-label="Filebonsai Library"
			className="inline-flex min-h-touch items-center gap-2 rounded-md px-2 no-underline md:max-wide:w-touch md:max-wide:justify-center md:max-wide:px-0"
			to="/"
		>
			<img
				alt=""
				className="block h-[1.875rem] w-auto"
				src="/brand/filebonsai-mark.svg"
			/>
			<img
				alt=""
				className="block h-[1.625rem] w-auto md:max-wide:hidden"
				src="/brand/filebonsai-wordmark.svg"
			/>
		</Link>
	);
}

export function AppSidebar({ current }: { current: Destination }) {
	const storageDetail = useStorageDetail();
	return (
		<aside className="sticky top-0 flex h-dvh flex-col items-center gap-5 overflow-y-auto border-r bg-muted px-2 py-3 max-md:hidden wide:items-stretch wide:px-3 wide:py-4">
			<Wordmark />
			<nav
				aria-label="Main"
				className="flex w-full flex-1 flex-col items-center gap-1 wide:items-stretch"
			>
				<NavItem
					current={current === "library"}
					icon={Library}
					label="Library"
					placement="sidebar"
					to="/"
				/>
				<div className="mt-auto flex w-full justify-center border-t pt-3 wide:block">
					<NavItem
						current={current === "storage"}
						detail={storageDetail}
						icon={HardDrive}
						label="Storage"
						placement="sidebar"
						to="/storage"
					/>
				</div>
			</nav>
		</aside>
	);
}

export function BottomNav({ current }: { current: Destination }) {
	return (
		<nav
			aria-label="Main"
			className="fixed right-0 bottom-0 left-0 z-20 grid min-h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] auto-cols-fr grid-flow-col border-t bg-card pt-1 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden"
		>
			<NavItem
				current={current === "library"}
				icon={Library}
				label="Library"
				placement="bottom"
				to="/"
			/>
			<NavItem
				current={current === "storage"}
				icon={HardDrive}
				label="Storage"
				placement="bottom"
				to="/storage"
			/>
		</nav>
	);
}
