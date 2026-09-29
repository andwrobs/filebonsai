import {
	index,
	layout,
	type RouteConfig,
	route,
} from "@react-router/dev/routes";

/**
 * This is the application's routes configuration file.
 *
 * Each route has two required parts:
 * - a URL pattern to match the URL
 * - a file path to the route module that defines its behavior.
 *
 * React Router's routes API provides different options for structuring URLs and
 * nesting route modules, including: `index`, `route`, `layout`, and `...prefix`.
 *
 * Learn more here: https://reactrouter.com/start/framework/routing#configuring-routes
 */
export default [
	route("sign-in", "./routes/sign-in/sign-in.route.tsx"),
	// Pathless layout: navigation and the transfer tray persist across its pages.
	layout("./routes/app-shell/app-shell.route.tsx", [
		index("./routes/library-home/library-home.route.tsx"),
		route("library/:entryId", "./routes/library/library.route.tsx"),
		route("storage", "./routes/storage/storage.route.tsx"),
	]),
	route("*", "./routes/not-found/not-found.route.tsx"),
] satisfies RouteConfig;
