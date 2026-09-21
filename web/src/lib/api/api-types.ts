import type { components, operations } from "./generated/schema.js";

export type AccessCsrf = components["schemas"]["AccessCsrfResponse"];
export type AccessSession = components["schemas"]["AccessSessionResponse"];
export type ApiError = components["schemas"]["ApiErrorResponse"];
export type CurrentVersion = components["schemas"]["CurrentVersionResponse"];
export type Entry = components["schemas"]["EntryResponse"];
export type EntryPage = components["schemas"]["EntryPageResponse"];
export type FileEntry = components["schemas"]["FileEntryResponse"];
export type FolderEntry = components["schemas"]["FolderEntryResponse"];

export type GetCsrfOperation = operations["getCsrf"];
export type LoginOperation = operations["login"];
export type LogoutOperation = operations["logout"];
export type GetCurrentSessionOperation = operations["getCurrentSession"];
export type GetEntryOperation = operations["getEntry"];
export type ListChildrenOperation = operations["listChildren"];
export type CreateFolderOperation = operations["createFolder"];

export type LoginBody = LoginOperation["requestBody"]["content"]["application/json"];
export type CreateFolderBody = CreateFolderOperation["requestBody"]["content"]["application/json"];

export interface ListChildrenOptions {
  cursor?: string;
  limit?: number;
}

export interface CreateFolderInput extends CreateFolderBody {
  idempotencyKey: string;
}
