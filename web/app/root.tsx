import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import "./styles/tokens.css";
import "./styles/app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link href="/brand/filebonsai-app-icon.svg" rel="icon" type="image/svg+xml" />
        <link href="/brand/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <main className="page-loading">Opening your Library…</main>;
}

export default function App() {
  return <Outlet />;
}
