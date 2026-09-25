import { UploadControl, DownloadControl, TransferPanel } from "../features/transfers/transfer-controls.js";
import { useForm } from "@tanstack/react-form";
import {
  isRouteErrorResponse,
  Link,
  redirect,
  useLoaderData,
  useRevalidator,
} from "react-router";
import { useId, useState } from "react";

import type { Entry, FolderEntry } from "../../src/lib/api/api-types.js";
import { filebonsaiService } from "../../src/lib/api/filebonsai-service.js";
import { catalogHref, entryMeta, errorMessage, uniqueEntries } from "../features/catalog/catalog-data.js";
import { AppSidebar } from "../features/shell/app-sidebar.js";

interface LibraryData {
  children: Entry[];
  folder: FolderEntry;
  nextCursor: string | null;
}

function failureResponse(response: Response, message: string) {
  return new Response(message, { status: response.status, statusText: response.statusText });
}

export async function clientLoader({ params }: { params: { entryId?: string } }) {
  const entryId = params.entryId;
  if (!entryId) {
    throw new Response("A Library folder ID is required.", { status: 404 });
  }
  const service = filebonsaiService();
  const [entryResult, childrenResult] = await Promise.all([service.getEntry(entryId), service.listChildren(entryId)]);
  if (!entryResult.data) {
    if (entryResult.response.status === 401) throw redirect("/sign-in");
    throw failureResponse(entryResult.response, errorMessage(entryResult.error, "Could not open this folder."));
  }
  if (entryResult.data.kind !== "folder") {
    throw new Response("This entry is a file, not a folder.", { status: 404 });
  }
  if (!childrenResult.data) {
    if (childrenResult.response.status === 401) throw redirect("/sign-in");
    throw failureResponse(childrenResult.response, errorMessage(childrenResult.error, "Could not list this folder."));
  }
  return {
    children: uniqueEntries(childrenResult.data.entries),
    folder: entryResult.data,
    nextCursor: childrenResult.data.nextCursor,
  } satisfies LibraryData;
}

clientLoader.hydrate = true;

export function meta() {
  return [{ title: "Library · Filebonsai" }, { name: "description", content: "Browse your Filebonsai Library." }];
}

export default function Library() {
  const { children, folder, nextCursor } = useLoaderData<LibraryData>();
  const revalidator = useRevalidator();
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const nameId = useId();
  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      const result = await filebonsaiService().createFolder({
        idempotencyKey: crypto.randomUUID(),
        name: value.name,
        parentId: folder.id,
      });
      if (!result.data) {
        setSubmitError(errorMessage(result.error, "The folder could not be created."));
        return;
      }
      form.reset();
      setIsCreating(false);
      revalidator.revalidate();
    },
  });

  return (
    <main className="library-shell">
      <AppSidebar current="library" />

      <section className="library-content" aria-busy={revalidator.state !== "idle"}>
        <header className="library-header">
          <div>
            <p className="eyebrow">Library</p>
            <h1>{folder.name}</h1>
            <p className="breadcrumb" aria-label="Current location">Library / {folder.name}</p>
          </div>
          <UploadControl parentId={folder.id} />
          <button className="primary-button" onClick={() => setIsCreating(true)} type="button">
            New folder
          </button>
        </header>

        <TransferPanel />

        {isCreating ? (
          <section className="folder-form-panel" aria-labelledby="new-folder-heading">
            <div>
              <h2 id="new-folder-heading">Create folder</h2>
              <p>Names are preserved exactly as entered.</p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return "Enter a folder name.";
                    if (value.length > 255) return "Folder names must be 255 characters or fewer.";
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <label htmlFor={nameId}>
                    Folder name
                    <input
                      autoFocus
                      id={nameId}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      value={field.state.value}
                    />
                    {field.state.meta.errors.length ? (
                      <span className="field-error">{field.state.meta.errors.join(" ")}</span>
                    ) : null}
                  </label>
                )}
              </form.Field>
              {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
              <div className="form-actions">
                <button className="secondary-button" onClick={() => setIsCreating(false)} type="button">Cancel</button>
                <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                  {([canSubmit, isSubmitting]) => (
                    <button className="primary-button" disabled={!canSubmit || isSubmitting} type="submit">
                      {isSubmitting ? "Creating…" : "Create folder"}
                    </button>
                  )}
                </form.Subscribe>
              </div>
            </form>
          </section>
        ) : null}

        <section aria-labelledby="items-heading">
          <div className="section-heading">
            <h2 id="items-heading">Items</h2>
            <p>{children.length} {children.length === 1 ? "item" : "items"}</p>
          </div>
          {children.length === 0 ? (
            <div className="empty-state">
              <h2>This folder is empty</h2>
              <p>Create a folder to start organizing your Library.</p>
              <button className="primary-button" onClick={() => setIsCreating(true)} type="button">Create folder</button>
            </div>
          ) : (
            <ul className="entry-list">
              {children.map((entry) => (
                <li key={entry.id}>
                  {entry.kind === "folder" ? (
                    <Link className="entry-row" to={catalogHref(entry.id)}>
                      <span className="entry-kind" aria-hidden="true">Folder</span>
                      <span className="entry-name">{entry.name}</span>
                      <span className="entry-meta">{entryMeta(entry)}</span>
                    </Link>
                  ) : (
                    <span className="entry-row file-row">
                      <span className="entry-kind" aria-hidden="true">File</span>
                      <span className="entry-name">{entry.name}</span>
                      <span className="entry-meta">{entryMeta(entry)}</span>
                      <DownloadControl id={entry.id} name={entry.name} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {nextCursor ? <p className="pagination-note">More items are available; loading additional pages is coming next.</p> : null}
        </section>
      </section>
    </main>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.statusText || (status === 404 ? "This folder is not available." : "The Library is unavailable.")
    : "The Library is unavailable.";
  return (
    <main className="route-error">
      <p className="eyebrow">{status === 401 ? "Sign in" : status === 404 ? "Not found" : "Unavailable"}</p>
      <h1>{status === 401 ? "Open your Library" : message}</h1>
      {status === 401 ? <Link className="primary-button" to="/sign-in">Sign in</Link> : <Link className="primary-button" to="/">Return to Library</Link>}
    </main>
  );
}
