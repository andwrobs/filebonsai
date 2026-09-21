import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/library-home.tsx"),
  route("library/:entryId", "routes/library.tsx"),
] satisfies RouteConfig;
