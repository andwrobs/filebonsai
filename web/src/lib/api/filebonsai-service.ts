import createClient, { type ClientOptions } from "openapi-fetch";

import type { paths } from "./generated/schema.js";
import type { CreateFolderInput, ListChildrenOptions, LoginBody } from "./api-types.js";

export interface FilebonsaiServiceOptions {
  baseUrl?: string;
  fetch?: ClientOptions["fetch"];
  Request?: ClientOptions["Request"];
}

export class FilebonsaiService {
  readonly #client;
  #csrfToken: string | undefined;

  constructor({ baseUrl = "", fetch, Request }: FilebonsaiServiceOptions = {}) {
    this.#client = createClient<paths>({
      baseUrl,
      credentials: "include",
      fetch,
      Request,
    });
  }

  async refreshCsrf() {
    const result = await this.#client.GET("/api/v1/auth/csrf");
    if (result.data) {
      this.#csrfToken = result.data.token;
    }
    return result;
  }

  async login(password: LoginBody["password"]) {
    const csrf = await this.refreshCsrf();
    if (!csrf.data) throw new Error("Could not obtain a CSRF token");
    const csrfToken = csrf.data.token;
    const result = await this.#client.POST("/api/v1/auth/login", {
      params: { header: { "X-CSRF-TOKEN": csrfToken } },
      body: { password },
    });
    if (result.data) {
      this.#csrfToken = undefined;
    }
    return result;
  }

  async logout() {
    const csrfToken = await this.#requireCsrf();
    const result = await this.#client.POST("/api/v1/auth/logout", {
      params: { header: { "X-CSRF-TOKEN": csrfToken } },
    });
    if (result.response.ok) {
      this.#csrfToken = undefined;
    }
    return result;
  }

  getCurrentSession() {
    return this.#client.GET("/api/v1/auth/me");
  }

  getWorkspaceRoot() {
    return this.#client.GET("/api/v1/catalog/root");
  }

  getEntry(id: string) {
    return this.#client.GET("/api/v1/entries/{id}", {
      params: { path: { id } },
    });
  }

  listChildren(id: string, { cursor, limit }: ListChildrenOptions = {}) {
    return this.#client.GET("/api/v1/entries/{id}/children", {
      params: {
        path: { id },
        query: { cursor, limit },
      },
    });
  }

  async createFolder({ idempotencyKey, name, parentId }: CreateFolderInput) {
    const csrfToken = await this.#requireCsrf();
    return this.#client.POST("/api/v1/folders", {
      params: {
        header: {
          "Idempotency-Key": idempotencyKey,
          "X-CSRF-TOKEN": csrfToken,
        },
      },
      body: { name, parentId },
    });
  }

  async beginUpload(body: import("./generated/schema.js").components["schemas"]["BeginUploadRequest"], idempotencyKey: string) {
    return this.#client.POST("/api/v1/uploads", {
      params: { header: { "X-CSRF-TOKEN": await this.#requireCsrf(), "Idempotency-Key": idempotencyKey } }, body,
    });
  }

  getUpload(id: string) {
    return this.#client.GET("/api/v1/uploads/{id}", { params: { path: { id } } });
  }

  async sendUpload(id: string, file: Blob) {
    return this.#client.PUT("/api/v1/uploads/{id}/content", {
      params: { path: { id }, header: { "X-CSRF-TOKEN": await this.#requireCsrf() } },
      headers: { "Content-Type": "application/octet-stream" },
      // OpenAPI binary bodies are represented as strings; the serializer sends the original Blob.
      body: "", bodySerializer: () => file,
    });
  }

  async completeUpload(id: string) {
    return this.#client.POST("/api/v1/uploads/{id}/complete", {
      params: { path: { id }, header: { "X-CSRF-TOKEN": await this.#requireCsrf() } },
    });
  }

  async cancelUpload(id: string) {
    return this.#client.DELETE("/api/v1/uploads/{id}", {
      params: { path: { id }, header: { "X-CSRF-TOKEN": await this.#requireCsrf() } },
    });
  }

  downloadOriginal(id: string) {
    return this.#client.GET("/api/v1/entries/{id}/content", {
      params: { path: { id } }, parseAs: "blob",
    });
  }

  async #requireCsrf() {
    if (this.#csrfToken) return this.#csrfToken;

    const result = await this.refreshCsrf();
    if (!result.data) {
      throw new Error("Could not obtain a CSRF token");
    }
    return result.data.token;
  }
}

export const filebonsaiService = (options?: FilebonsaiServiceOptions) => new FilebonsaiService(options);
