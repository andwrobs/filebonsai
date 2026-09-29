import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-aria-components";
import {
	createRoutesStub,
	Meta,
	Outlet,
	useHref,
	useLocation,
	useNavigate,
} from "react-router";

type StubRoute = Parameters<typeof createRoutesStub>[0][number];
// Route modules type meta with their own args; the stub only calls it.
type RouteInput = Omit<StubRoute, "meta" | "children"> & {
	meta?: (args: never) => unknown;
	children?: RouteInput[];
};

// Aria links navigate through the router, as in lib/app/AppProviders. Meta sets
// document.title from the routes' meta exports; the output and button let tests
// read the URL and go Back.
function TestShell() {
	const navigate = useNavigate();
	const location = useLocation();
	return (
		<RouterProvider navigate={navigate} useHref={useHref}>
			<Meta />
			<Outlet />
			<output aria-label="Test location">
				{location.pathname}
				{location.search}
			</output>
			<button type="button" onClick={() => navigate(-1)}>
				Test back
			</button>
		</RouterProvider>
	);
}

/**
 * Renders route modules in a memory router with a Query provider. Pass the
 * shared queryClient when a clientLoader writes to it; otherwise each call
 * gets its own cache. With fake timers, pass
 * `userOptions: { advanceTimers: vi.advanceTimersByTime }`.
 */
export function renderRoute(
	routes: RouteInput[],
	{
		initialEntries = ["/"],
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		}),
		userOptions,
	}: {
		initialEntries?: string[];
		queryClient?: QueryClient;
		userOptions?: Parameters<typeof userEvent.setup>[0];
	} = {},
) {
	const Stub = createRoutesStub([
		{
			Component: TestShell,
			HydrateFallback: () => null,
			children: routes as StubRoute[],
		},
	]);
	const user = userEvent.setup(userOptions);
	const result = render(
		<QueryClientProvider client={queryClient}>
			<Stub initialEntries={initialEntries} />
		</QueryClientProvider>,
	);
	return { ...result, user, queryClient };
}
