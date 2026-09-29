import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, FolderOpen, FolderPlus, Info } from "lucide-react";
import { useId, useState } from "react";
import { data, isRouteErrorResponse, Link, redirect } from "react-router";
import { ApiError, isUnauthorized } from "~/lib/api/api";
import {
	catalogHref,
	type FolderListing,
	NotAFolderError,
} from "~/lib/catalog/catalog";
import { folderQuery } from "~/lib/catalog/catalog.query";
import { pageTitle } from "~/lib/meta/title";
import { queryClient } from "~/lib/query/client";
import { UploadControl } from "~/lib/transfers/UploadControl";
import { Breadcrumb } from "~/lib/ui/breadcrumb";
import { Button, buttonVariants } from "~/lib/ui/button";
import { Empty } from "~/lib/ui/empty";
import { cn } from "~/lib/ui/utils";
import type { Route } from "./+types/library.route";
import { EntryList } from "./components/EntryList";
import { InspectorPanel, useInspector } from "./components/Inspector";
import { NewFolderForm } from "./components/NewFolderForm";

export const meta: Route.MetaFunction = () => [
	{ title: pageTitle("Library") },
	{ name: "description", content: "Browse your Filebonsai Library." },
];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
	try {
		await queryClient.fetchQuery(folderQuery(params.entryId));
	} catch (error) {
		if (isUnauthorized(error)) throw redirect("/sign-in");
		if (error instanceof NotAFolderError) throw data(null, { status: 404 });
		throw error;
	}
	return { entryId: params.entryId };
}

export default function LibraryRoute({ loaderData }: Route.ComponentProps) {
	const { data: listing, isFetching } = useQuery(
		folderQuery(loaderData.entryId),
	);
	// The loader filled the cache; a failed refresh keeps the last listing.
	if (!listing) return null;
	return <Folder listing={listing} refreshing={isFetching} />;
}

function Folder({
	listing: { children, folder, nextCursor },
	refreshing,
}: {
	listing: FolderListing;
	refreshing: boolean;
}) {
	const [isCreating, setIsCreating] = useState(false);
	const inspectorId = useId();
	const inspector = useInspector(folder, children);

	return (
		<div className="@container/page flex flex-1 flex-col gap-5 px-gutter pt-4 pb-8 max-md:pr-[max(var(--content-gutter),env(safe-area-inset-right))] max-md:pb-[calc(--spacing(8)+3.5rem)] max-md:pl-[max(var(--content-gutter),env(safe-area-inset-left))]">
			<header className="flex min-h-[calc(var(--control-height)+--spacing(4))] flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b pb-3">
				<div className="flex min-w-0 flex-[1_1_12rem] items-center gap-1">
					{folder.parentId ? (
						<Link
							aria-label="Parent folder"
							className={buttonVariants({ variant: "ghost", size: "icon" })}
							title="Parent folder"
							to={catalogHref(folder.parentId)}
						>
							<ChevronLeft aria-hidden="true" />
						</Link>
					) : null}
					<Breadcrumb aria-label="Breadcrumb">
						<ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-md text-muted-foreground">
							{folder.parentId ? (
								<li className="flex min-w-0 items-center gap-2">
									<Link
										className="rounded-sm text-muted-foreground no-underline hover:text-foreground hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-touch pointer-coarse:items-center"
										to="/"
									>
										Library
									</Link>
								</li>
							) : null}
							<li
								aria-current="page"
								className={cn(
									"flex min-w-0 items-center gap-2",
									// The separator: a chevron drawn from two borders.
									folder.parentId &&
										"before:mr-[0.15em] before:size-[0.4em] before:rotate-45 before:border-t-[1.5px] before:border-r-[1.5px] before:border-subtle-foreground",
								)}
							>
								<h1 className="text-xl leading-tight font-semibold wrap-anywhere text-foreground">
									{folder.name}
								</h1>
							</li>
						</ol>
					</Breadcrumb>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						className={toolbarButton}
						onPress={() => setIsCreating(true)}
						variant="outline"
					>
						<FolderPlus aria-hidden="true" />
						<span className={toolbarLabel}>New folder</span>
					</Button>
					<UploadControl parentId={folder.id} />
					<Button
						aria-controls={inspector.open ? inspectorId : undefined}
						aria-expanded={inspector.open}
						className={cn(
							toolbarButton,
							// Open, it reads as selected; hovering still shows the hover fill.
							"aria-expanded:border-selection-border aria-expanded:bg-selection aria-expanded:text-selection-foreground aria-expanded:not-data-disabled:hover:bg-accent",
						)}
						onPress={(event) => inspector.toggle(event.target as HTMLElement)}
						ref={inspector.toggleButton}
						variant="outline"
					>
						<Info aria-hidden="true" />
						<span className={toolbarLabel}>Details</span>
					</Button>
				</div>
			</header>

			<div
				className={cn(
					"grid grid-cols-[minmax(0,1fr)] gap-6",
					inspector.open &&
						inspector.docked &&
						"grid-cols-[minmax(0,1fr)_var(--inspector-width)]",
				)}
			>
				<div className="flex min-w-0 flex-col gap-5">
					{isCreating ? (
						<NewFolderForm
							// A form belongs to one folder; moving on starts a new one.
							key={folder.id}
							onClose={() => setIsCreating(false)}
							parentId={folder.id}
						/>
					) : null}

					<section
						className="@container/entries flex min-w-0 flex-col"
						aria-busy={refreshing}
						aria-labelledby="items-heading"
					>
						<h2 className="sr-only" id="items-heading">
							Items
						</h2>
						{children.length === 0 ? (
							<Empty className="flex-none gap-2 rounded-lg border border-border-strong bg-background px-6 py-12 text-wrap">
								<FolderOpen
									aria-hidden="true"
									className="size-10 text-kind-folder"
									strokeWidth={1.5}
								/>
								<h3 className="text-lg font-semibold">This folder is empty</h3>
								<p className="max-w-[28rem] text-muted-foreground">
									Upload files or create a folder to start organizing your
									Library.
								</p>
								<div className="mt-3 flex flex-wrap justify-center gap-2">
									<Button onPress={() => setIsCreating(true)} variant="outline">
										Create folder
									</Button>
									<UploadControl parentId={folder.id} variant="inline" />
								</div>
							</Empty>
						) : (
							<EntryList
								entries={children}
								inspector={inspector}
								inspectorId={inspectorId}
							/>
						)}
						{nextCursor ? (
							<p className="mt-3 text-sm text-muted-foreground">
								More items are available; loading additional pages is coming
								next.
							</p>
						) : null}
					</section>
				</div>
				<InspectorPanel id={inspectorId} inspector={inspector} />
			</div>

			<UploadControl parentId={folder.id} variant="fab" />
		</div>
	);
}

// On a narrow page the labelled toolbar buttons become icon buttons.
const toolbarButton = "@max-[30rem]/page:w-control @max-[30rem]/page:px-0";
const toolbarLabel = "@max-[30rem]/page:sr-only";

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const status = isRouteErrorResponse(error)
		? error.status
		: error instanceof ApiError
			? (error.status ?? 500)
			: 500;
	return (
		<div className="page-message" role="alert">
			<p className="eyebrow">
				{status === 401
					? "Sign in"
					: status === 404
						? "Not found"
						: "Unavailable"}
			</p>
			<h1>
				{status === 401
					? "Open your Library"
					: status === 404
						? "This folder is not available."
						: "The Library is unavailable."}
			</h1>
			{status === 401 ? (
				<Link className="button primary" to="/sign-in">
					Sign in
				</Link>
			) : (
				<Link className="button primary" to="/">
					Return to Library
				</Link>
			)}
		</div>
	);
}
