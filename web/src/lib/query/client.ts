import { QueryClient } from "@tanstack/react-query";
import { isTransient } from "~/lib/api/api";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			// Retry once, and only failures a retry could change.
			queries: {
				staleTime: 60_000,
				retry: (failures, error) => failures < 1 && isTransient(error),
			},
		},
	});
}

// One cache per browser app, shared by clientLoaders and React. The SPA build
// may import this module but never populates it with user data at build time.
export const queryClient = createQueryClient();
