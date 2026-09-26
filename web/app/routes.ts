import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("sign-in", "routes/sign-in.tsx"),
  layout("routes/app-shell.tsx", [
    index("routes/library-home.tsx"),
    route("library/:entryId", "routes/library.tsx"),
    route("storage", "routes/storage.tsx"),
  ]),
] satisfies RouteConfig;
