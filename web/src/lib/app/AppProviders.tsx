import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { RouterProvider } from "react-aria-components";
import { type NavigateOptions, useHref, useNavigate } from "react-router";
import { queryClient } from "~/lib/query/client";

declare module "react-aria-components" {
	interface RouterConfig {
		routerOptions: NavigateOptions;
	}
}

export function AppProviders({ children }: PropsWithChildren) {
	const navigate = useNavigate();
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider navigate={navigate} useHref={useHref}>
				{children}
			</RouterProvider>
		</QueryClientProvider>
	);
}
