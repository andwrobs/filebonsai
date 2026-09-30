import type { FolderDetails } from "~/lib/catalog/catalog";
import { catalogHref } from "~/lib/catalog/catalog";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
} from "~/lib/ui/breadcrumb";
import { Button } from "~/lib/ui/button";
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/lib/ui/dropdown-menu";

type Ancestor = FolderDetails["ancestors"][number];

function AncestorLink({
	ancestor,
	className,
}: {
	ancestor: Ancestor;
	className?: string;
}) {
	return (
		<BreadcrumbItem className={`min-w-0 ${className ?? ""}`}>
			<BreadcrumbLink
				className="block max-w-24 truncate rounded-sm text-muted-foreground hover:underline sm:max-w-40"
				href={catalogHref(ancestor.id)}
			>
				<span title={ancestor.name}>{ancestor.name}</span>
			</BreadcrumbLink>
		</BreadcrumbItem>
	);
}

export function FolderBreadcrumbs({ folder }: { folder: FolderDetails }) {
	const { ancestors } = folder;
	const root = ancestors[0];
	const otherParents = ancestors.slice(1);
	const recentParents = ancestors
		.slice(-2)
		.filter((ancestor) => ancestor.id !== root?.id);

	return (
		<Breadcrumb aria-label="Folder path" className="min-w-0">
			<BreadcrumbList className="min-w-0 flex-nowrap gap-x-1 text-md">
				{root ? <AncestorLink ancestor={root} className="shrink-0" /> : null}
				{otherParents.length > 0 ? (
					<BreadcrumbItem
						className={ancestors.length <= 3 ? "lg:hidden" : undefined}
					>
						<DropdownMenuTrigger>
							<Button
								aria-label="More parent folders"
								size="icon"
								variant="ghost"
							>
								<span aria-hidden="true">…</span>
							</Button>
							<DropdownMenu
								aria-label="Parent folders"
								className="max-h-[min(60vh,24rem)] w-max max-w-[min(20rem,calc(100vw-2rem))]"
							>
								{otherParents.map((ancestor) => (
									<DropdownMenuItem
										className="wrap-anywhere"
										href={catalogHref(ancestor.id)}
										key={ancestor.id}
										textValue={ancestor.name}
									>
										{ancestor.name}
									</DropdownMenuItem>
								))}
							</DropdownMenu>
						</DropdownMenuTrigger>
					</BreadcrumbItem>
				) : null}
				{recentParents.map((ancestor) => (
					<AncestorLink
						ancestor={ancestor}
						className="hidden lg:inline-flex"
						key={ancestor.id}
					/>
				))}
				<BreadcrumbItem className="min-w-0">
					<h1
						aria-current="page"
						className="min-w-0 truncate text-xl leading-tight font-semibold text-foreground"
						title={folder.name}
					>
						{folder.name}
					</h1>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
