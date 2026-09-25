import { isRouteErrorResponse, Link, redirect } from "react-router";

import { catalogHref, errorMessage } from "../features/catalog/catalog-data.js";
import { filebonsaiService } from "../../src/lib/api/filebonsai-service.js";

export async function clientLoader() {
  const result = await filebonsaiService().getWorkspaceRoot();
  if (result.data) {
    return redirect(catalogHref(result.data.id));
  }
  if (result.response.status === 401) {
    return redirect("/sign-in");
  }
  throw new Response(errorMessage(result.error, "Could not open your Library."), {
    status: result.response.status,
    statusText: "Library unavailable",
  });
}

clientLoader.hydrate = true;

export default function LibraryHome() {
  return null;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <main className="route-error">
      <p className="eyebrow">{status === 401 ? "Sign in" : "Unavailable"}</p>
      <h1>{status === 401 ? "Open your Library" : "The Library is unavailable."}</h1>
      {status === 401 ? <Link className="primary-button" to="/sign-in">Sign in</Link> : null}
    </main>
  );
}
