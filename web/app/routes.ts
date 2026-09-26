import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/library-home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("library/:entryId", "routes/library.tsx"),
  route("storage", "routes/storage.tsx"),
] satisfies RouteConfig;
