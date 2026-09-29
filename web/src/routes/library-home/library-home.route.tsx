import { isRouteErrorResponse, Link, redirect } from "react-router";
import { ApiError, isUnauthorized } from "~/lib/api/api";
import { catalogHref } from "~/lib/catalog/catalog";
import { workspaceRootQuery } from "~/lib/catalog/catalog.query";
import { queryClient } from "~/lib/query/client";
import type { Route } from "./+types/library-home.route";

// The Library's address is its root folder's; this route only finds it.
export async function clientLoader() {
	try {
		const root = await queryClient.fetchQuery(workspaceRootQuery());
		return redirect(catalogHref(root.id));
	} catch (error) {
		if (isUnauthorized(error)) return redirect("/sign-in");
		throw error;
	}
}

export default function LibraryHomeRoute() {
	return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const status = isRouteErrorResponse(error)
		? error.status
		: error instanceof ApiError
			? error.status
			: undefined;
	return (
		<div className="page-message" role="alert">
			<p className="eyebrow">{status === 401 ? "Sign in" : "Unavailable"}</p>
			<h1>
				{status === 401 ? "Open your Library" : "The Library is unavailable."}
			</h1>
			{status === 401 ? (
				<Link className="button primary" to="/sign-in">
					Sign in
				</Link>
			) : null}
		</div>
	);
}
