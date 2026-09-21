import { redirect } from "react-router";

import { catalogHref, errorMessage } from "../features/catalog/catalog-data.js";
import { filebonsaiService } from "../../src/lib/api/filebonsai-service.js";

export async function clientLoader() {
  const result = await filebonsaiService().getWorkspaceRoot();
  if (result.data) {
    return redirect(catalogHref(result.data.id));
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
