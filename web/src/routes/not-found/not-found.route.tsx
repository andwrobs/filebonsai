import { useLocation } from "react-router";
import { pageTitle } from "~/lib/meta/title";
import { LinkButton } from "~/lib/ui/button";
import type { Route } from "./+types/not-found.route";

export const meta: Route.MetaFunction = () => [
	{ title: pageTitle("Page not found") },
];

// The static host serves index.html for every path, so unknown URLs land here.
export default function NotFoundRoute() {
	const { pathname } = useLocation();
	return (
		<main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-16 sm:px-6">
			<div className="space-y-2">
				<p className="text-sm font-medium text-muted-foreground">404</p>
				<h1 className="text-3xl font-semibold tracking-tight">
					Page not found
				</h1>
				<p className="text-muted-foreground">
					Nothing lives at{" "}
					<code className="rounded bg-muted px-1.5 py-0.5 text-sm break-all text-foreground">
						{pathname}
					</code>
					. Check the address, or start from your Library.
				</p>
			</div>
			<LinkButton href="/">Go to your Library</LinkButton>
		</main>
	);
}
