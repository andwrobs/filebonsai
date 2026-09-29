import type React from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import { AppProviders } from "~/lib/app/AppProviders";
import { RouteFocus } from "~/lib/app/RouteFocus";
import { pageTitle } from "~/lib/meta/title";
import { Button, LinkButton } from "~/lib/ui/button";
import type { Route } from "./+types/root";

import "~/styles/index.css";
// Filebonsai's current screens; lib/ui components replace them screen by screen.
import "~/styles/tokens.css";
import "~/styles/app.css";

// Routes without their own meta, the SPA build's index.html, and error pages use
// this.
export const meta: Route.MetaFunction = ({ error }) => [
	{ title: pageTitle(error ? "Error" : undefined) },
];

export function HydrateFallback() {
	return (
		<main className="page-loading" role="status">
			Opening your Library…
		</main>
	);
}

/**
 * Special file `root.tsx` root route supports a `Layout` export, routes defined in `routes.ts` do not.
 *
 * The `Layout` component serves 2 purposes:
 * - Avoid duplicating your document's "app shell" across your root component, `HydrateFallback`, and `ErrorBoundary`
 * - Prevent React from re-mounting your app shell elements when switching between the root component/HydrateFallback/ErrorBoundary
 * which can cause a FOUC if React removes and re-adds `<link>` tags from your `<Links>` component.
 *
 * https://reactrouter.com/explanation/special-files#layout-export
 */
export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, viewport-fit=cover"
				/>
				<link
					href="/brand/filebonsai-app-icon.svg"
					rel="icon"
					type="image/svg+xml"
				/>
				<link
					href="/brand/apple-touch-icon.png"
					rel="apple-touch-icon"
					sizes="180x180"
				/>
				<Meta />
				<Links />
			</head>
			<body>
				<AppProviders>{children}</AppProviders>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

/**
 * All routes configured in routes.ts are rendered through the `<Outlet/>` in this component.
 * The Library and Storage share the shell layout route; sign-in stands alone.
 *
 * https://reactrouter.com/start/framework/route-module#component-default
 */
export default function RootRoute() {
	return (
		<>
			<RouteFocus />
			<Outlet />
		</>
	);
}

/**
 * Route modules will automatically catch errors in your code and render the closest ErrorBoundary.
 *
 * All application's should at a minimum export a root error boundary to protect against unhandled exceptions in:
 * - clientLoader
 * - clientAction
 * - component code
 *
 * https://reactrouter.com/how-to/error-boundary#error-boundaries
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let title = "Something went wrong";
	let details = "An unexpected error stopped this page. Reload to try again.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
		details =
			error.status === 404
				? "Nothing lives at this address."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	console.error(error);

	// Rendered without the app shell, in case the shell is what failed.
	return (
		<main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-16 sm:px-6">
			<div className="space-y-2">
				<p className="text-sm font-medium text-muted-foreground">Error</p>
				<h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
				<p className="text-muted-foreground">{details}</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button onPress={() => window.location.reload()}>Reload</Button>
				<LinkButton href="/" variant="outline">
					Go to your Library
				</LinkButton>
			</div>
			{stack && (
				<pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
