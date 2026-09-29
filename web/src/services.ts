import { createApiClient } from "~/lib/api/api";
import { createCatalogService } from "~/lib/catalog/catalog.service";
import { createStorageService } from "~/lib/storage/storage.service";
import { createTransfersService } from "~/lib/transfers/transfers.service";
import { createAccessService } from "~/routes/sign-in/access.service";

// The composition root. Every service is built once, here, in dependency order,
// and exported as an instance; nothing else imports a factory. Swap an
// implementation (a fake server, fixture data) here, not in its consumers.

// One client, so every service shares the session's CSRF token. The contract's
// /api/v1 paths are served from this origin; the build has no location.
const api = createApiClient({ baseUrl: globalThis.location?.origin ?? "" });

export const accessService = createAccessService({ api });
export const catalogService = createCatalogService({ api });
export const storageService = createStorageService({ api });
export const transfersService = createTransfersService({ api });
