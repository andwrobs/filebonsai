import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, FolderOpen, FolderPlus, Info } from "lucide-react";
import { useId, useState } from "react";
import {
	data,
	isRouteErrorResponse,
	redirect,
	useNavigation,
} from "react-router";
import { ApiError, isUnauthorized } from "~/lib/api/api";
import {
	type ChildrenPage,
	catalogHref,
	type FolderDetails,
	NotAFolderError,
} from "~/lib/catalog/catalog";
import { firstPageQuery, folderQuery } from "~/lib/catalog/catalog.query";
import { pageTitle } from "~/lib/meta/title";
import { queryClient } from "~/lib/query/client";
import { UploadControl } from "~/lib/transfers/UploadControl";
import { Button, LinkButton } from "~/lib/ui/button";
import type { Route } from "./+types/library.route";
import { Entries, ViewControls } from "./components/Entries";
import { FolderBreadcrumbs } from "./components/FolderBreadcrumbs";
import { InspectorPanel, useInspector } from "./components/Inspector";
import { NewFolderForm } from "./components/NewFolderForm";
import { orderFromSearch } from "./listing-order";
import { useLibraryView } from "./useLibraryView";

export const meta: Route.MetaFunction = () => [
	{ title: pageTitle("Library") },
	{ name: "description", content: "Browse your Filebonsai Library." },
];

export async function clientLoader({
	params,
	request,
}: Route.ClientLoaderArgs) {
	const order = orderFromSearch(new URL(request.url).searchParams);
	// Both at once; the folder's own failure explains the page best.
	const [folder, page] = await Promise.allSettled([
		queryClient.fetchQuery(folderQuery(params.entryId)),
		queryClient.fetchQuery(firstPageQuery(params.entryId, order)),
	]);
	const failure =
		folder.status === "rejected"
			? folder.reason
			: page.status === "rejected"
				? page.reason
				: undefined;
	if (failure !== undefined) {
		if (isUnauthorized(failure)) throw redirect("/sign-in");
		if (failure instanceof NotAFolderError) throw data(null, { status: 404 });
		throw failure;
	}
	return { entryId: params.entryId, order };
}

export default function LibraryRoute({ loaderData }: Route.ComponentProps) {
	const { entryId, order } = loaderData;
	const { data: folder } = useQuery(folderQuery(entryId));
	const { data: page, isFetching } = useQuery(firstPageQuery(entryId, order));
	const navigation = useNavigation();
	// The loader filled the cache; a failed refresh keeps the last listing.
	if (!folder || !page) return null;
	return (
		<Folder
			folder={folder}
			order={order}
			page={page}
			// A new order loads on this same page before the table changes.
			refreshing={
				isFetching ||
				(navigation.state === "loading" &&
					navigation.location.pathname === catalogHref(entryId))
			}
		/>
	);
}

function Folder({
	folder,
	order,
	page: { children, nextCursor },
	refreshing,
}: {
	folder: FolderDetails;
	order: Route.ComponentProps["loaderData"]["order"];
	page: ChildrenPage;
	refreshing: boolean;
}) {
	const [isCreating, setIsCreating] = useState(false);
	const inspectorId = useId();
	const inspector = useInspector(folder, children);
	const library = useLibraryView(order);

	return (
		<div className="@container/page flex flex-1 flex-col gap-5 px-(--content-gutter) pt-4 pb-8 max-md:pb-[calc(--spacing(8)+3.5rem)] max-md:pl-[max(var(--content-gutter),env(safe-area-inset-left))] max-md:pr-[max(var(--content-gutter),env(safe-area-inset-right))]">
			<header className="flex min-h-[calc(var(--control-height)+1rem)] flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b pb-3 @max-[30rem]/page:flex-col @max-[30rem]/page:flex-nowrap @max-[30rem]/page:items-stretch">
				<div className="flex min-w-0 flex-[1_1_12rem] items-center gap-1 @max-[30rem]/page:flex-none">
					{folder.parentId ? (
						<LinkButton
							aria-label="Parent folder"
							size="icon"
							href={catalogHref(folder.parentId)}
							variant="ghost"
						>
							<ChevronLeft aria-hidden="true" />
						</LinkButton>
					) : null}
					<FolderBreadcrumbs folder={folder} />
				</div>
				<div className="flex flex-wrap items-center gap-2 @max-[30rem]/page:justify-end">
					<Button
						className="@max-[30rem]/page:size-control @max-[30rem]/page:px-0"
						onPress={() => setIsCreating(true)}
						variant="outline"
					>
						<FolderPlus aria-hidden="true" />
						<span className="@max-[30rem]/page:sr-only">New folder</span>
					</Button>
					<UploadControl parentId={folder.id} />
					<ViewControls library={library} />
					<Button
						aria-controls={inspector.open ? inspectorId : undefined}
						aria-expanded={inspector.open}
						className="@max-[30rem]/page:size-control @max-[30rem]/page:px-0 aria-expanded:border-selection-border aria-expanded:bg-selection aria-expanded:text-selection-foreground"
						onPress={(event) =>
							inspector.toggle(event.target as HTMLButtonElement)
						}
						ref={inspector.toggleButton}
						variant="outline"
					>
						<Info aria-hidden="true" />
						<span className="@max-[30rem]/page:sr-only">Details</span>
					</Button>
				</div>
			</header>

			<div
				className="grid grid-cols-[minmax(0,1fr)] gap-6 data-[inspector=docked]:grid-cols-[minmax(0,1fr)_var(--inspector-width)]"
				data-inspector={
					inspector.open && inspector.docked ? "docked" : undefined
				}
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
							<div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-border-strong bg-background px-6 py-12 text-center">
								<FolderOpen
									aria-hidden="true"
									className="size-10 text-kind-folder"
									strokeWidth={1.5}
								/>
								<h3 className="text-lg font-semibold">This folder is empty</h3>
								<p className="max-w-md text-muted-foreground">
									Upload files or create a folder to start organizing your
									Library.
								</p>
								<div className="mt-3 flex flex-wrap justify-center gap-2">
									<Button onPress={() => setIsCreating(true)} variant="outline">
										Create folder
									</Button>
									<UploadControl parentId={folder.id} variant="inline" />
								</div>
							</div>
						) : (
							<Entries
								entries={children}
								inspector={inspector}
								inspectorId={inspectorId}
								labelledBy="items-heading"
								library={library}
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const status = isRouteErrorResponse(error)
		? error.status
		: error instanceof ApiError
			? (error.status ?? 500)
			: 500;
	return (
		<div
			className="mx-auto my-12 grid w-full max-w-2xl justify-items-start gap-3 px-(--content-gutter)"
			role="alert"
		>
			<p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
				{status === 401
					? "Sign in"
					: status === 404
						? "Not found"
						: "Unavailable"}
			</p>
			<h1 className="text-2xl leading-tight font-semibold">
				{status === 401
					? "Open your Library"
					: status === 404
						? "This folder is not available."
						: "The Library is unavailable."}
			</h1>
			{status === 401 ? (
				<LinkButton href="/sign-in">Sign in</LinkButton>
			) : (
				<LinkButton href="/">Return to Library</LinkButton>
			)}
		</div>
	);
}
