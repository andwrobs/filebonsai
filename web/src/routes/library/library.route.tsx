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
		<div className="page">
			<header className="page-toolbar">
				<div className="page-location">
					{folder.parentId ? (
						<Link
							aria-label="Parent folder"
							className="icon-button"
							title="Parent folder"
							to={catalogHref(folder.parentId)}
						>
							<ChevronLeft aria-hidden="true" />
						</Link>
					) : null}
					<nav aria-label="Breadcrumb">
						<ol className="breadcrumb">
							{folder.parentId ? (
								<li>
									<Link to="/">Library</Link>
								</li>
							) : null}
							<li aria-current="page">
								<h1>{folder.name}</h1>
							</li>
						</ol>
					</nav>
				</div>
				<div className="page-actions">
					<button
						className="button secondary"
						onClick={() => setIsCreating(true)}
						type="button"
					>
						<FolderPlus aria-hidden="true" className="button-icon" />
						<span className="button-label">New folder</span>
					</button>
					<UploadControl parentId={folder.id} />
					<button
						aria-controls={inspector.open ? inspectorId : undefined}
						aria-expanded={inspector.open}
						className="button secondary inspector-toggle"
						onClick={(event) => inspector.toggle(event.currentTarget)}
						ref={inspector.toggleButton}
						type="button"
					>
						<Info aria-hidden="true" className="button-icon" />
						<span className="button-label">Details</span>
					</button>
				</div>
			</header>

			<div
				className="library-body"
				data-inspector={
					inspector.open && inspector.docked ? "docked" : undefined
				}
			>
				<div className="library-content">
					{isCreating ? (
						<NewFolderForm
							// A form belongs to one folder; moving on starts a new one.
							key={folder.id}
							onClose={() => setIsCreating(false)}
							parentId={folder.id}
						/>
					) : null}

					<section
						className="entries"
						aria-busy={refreshing}
						aria-labelledby="items-heading"
					>
						<h2 className="visually-hidden" id="items-heading">
							Items
						</h2>
						{children.length === 0 ? (
							<div className="empty-state">
								<FolderOpen
									aria-hidden="true"
									className="empty-state-icon"
									strokeWidth={1.5}
								/>
								<h3>This folder is empty</h3>
								<p>
									Upload files or create a folder to start organizing your
									Library.
								</p>
								<div className="empty-state-actions">
									<button
										className="button secondary"
										onClick={() => setIsCreating(true)}
										type="button"
									>
										Create folder
									</button>
									<UploadControl parentId={folder.id} variant="inline" />
								</div>
							</div>
						) : (
							<EntryList
								entries={children}
								inspector={inspector}
								inspectorId={inspectorId}
							/>
						)}
						{nextCursor ? (
							<p className="pagination-note">
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
