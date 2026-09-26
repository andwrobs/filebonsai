import { useForm } from "@tanstack/react-form";
import { ChevronLeft, FolderOpen, FolderPlus } from "lucide-react";
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
import {
  catalogHref,
  entryKind,
  entryMeta,
  errorMessage,
  formatBytes,
  formatModified,
  uniqueEntries,
} from "../features/catalog/catalog-data.js";
import { EntryIcon } from "../features/catalog/entry-icon.js";
import { DownloadControl, UploadControl } from "../features/transfers/transfer-controls.js";

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
  const now = new Date();
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
    <div className="page">
      <header className="page-toolbar">
        <div className="page-location">
          {folder.parentId ? (
            <Link aria-label="Parent folder" className="icon-button" title="Parent folder" to={catalogHref(folder.parentId)}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          ) : null}
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumb">
              {folder.parentId ? <li><Link to="/">Library</Link></li> : null}
              <li aria-current="page"><h1>{folder.name}</h1></li>
            </ol>
          </nav>
        </div>
        <div className="page-actions">
          <button className="button secondary" onClick={() => setIsCreating(true)} type="button">
            <FolderPlus aria-hidden="true" className="button-icon" />
            <span className="button-label">New folder</span>
          </button>
          <UploadControl parentId={folder.id} />
        </div>
      </header>

      {isCreating ? (
        <section className="folder-form" aria-labelledby="new-folder-heading">
          <h2 id="new-folder-heading">Create folder</h2>
          <p className="folder-form-hint">Names are preserved exactly as entered.</p>
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
                <label className="field" htmlFor={nameId}>
                  <span className="field-label">Folder name</span>
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
            <div className="form-actions">
              <button className="button secondary" onClick={() => setIsCreating(false)} type="button">Cancel</button>
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                  <button className="button primary" disabled={!canSubmit || isSubmitting} type="submit">
                    {isSubmitting ? "Creating…" : "Create folder"}
                  </button>
                )}
              </form.Subscribe>
            </div>
          </form>
          {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
        </section>
      ) : null}

      <section className="entries" aria-busy={revalidator.state !== "idle"} aria-labelledby="items-heading">
        <h2 className="visually-hidden" id="items-heading">Items</h2>
        {children.length === 0 ? (
          <div className="empty-state">
            <FolderOpen aria-hidden="true" className="empty-state-icon" strokeWidth={1.5} />
            <h3>This folder is empty</h3>
            <p>Upload files or create a folder to start organizing your Library.</p>
            <div className="empty-state-actions">
              <button className="button secondary" onClick={() => setIsCreating(true)} type="button">Create folder</button>
              <UploadControl parentId={folder.id} variant="inline" />
            </div>
          </div>
        ) : (
          <>
            <div aria-hidden="true" className="entry-columns">
              <span />
              <span>Name</span>
              <span className="entry-kind">Kind</span>
              <span className="entry-size">Size</span>
              <span className="entry-modified">Modified</span>
              <span />
            </div>
            <ul className="entry-list">
              {children.map((entry) => {
                const kind = entryKind(entry);
                const cells = (
                  <>
                    <EntryIcon family={kind.family} />
                    <span className="entry-name">{entry.name}</span>
                    <span className="entry-kind">{kind.label}</span>
                    <span className="entry-size">{entry.kind === "file" ? formatBytes(entry.currentVersion.sizeBytes) : "—"}</span>
                    <span className="entry-modified"><time dateTime={entry.updatedAt}>{formatModified(entry.updatedAt, now)}</time></span>
                    <span className="entry-compact">{entryMeta(entry, now)}</span>
                  </>
                );
                return (
                  <li key={entry.id}>
                    {entry.kind === "folder" ? (
                      <Link className="entry-row" to={catalogHref(entry.id)}>{cells}</Link>
                    ) : (
                      <div className="entry-row">
                        {cells}
                        <DownloadControl id={entry.id} name={entry.name} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="entries-count">{children.length} {children.length === 1 ? "item" : "items"}</p>
          </>
        )}
        {nextCursor ? <p className="pagination-note">More items are available; loading additional pages is coming next.</p> : null}
      </section>

      <UploadControl parentId={folder.id} variant="fab" />
    </div>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.statusText || (status === 404 ? "This folder is not available." : "The Library is unavailable.")
    : "The Library is unavailable.";
  return (
    <div className="page-message" role="alert">
      <p className="eyebrow">{status === 401 ? "Sign in" : status === 404 ? "Not found" : "Unavailable"}</p>
      <h1>{status === 401 ? "Open your Library" : message}</h1>
      {status === 401 ? <Link className="button primary" to="/sign-in">Sign in</Link> : <Link className="button primary" to="/">Return to Library</Link>}
    </div>
  );
}
