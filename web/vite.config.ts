import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { parseEnv } from "./src/lib/env/schema";

// The dev server proxies the API and the OIDC redirect paths to the backend.
// It binds 127.0.0.1; "localhost" can resolve to ::1 first and miss it.
const apiTarget =
	process.env.FILEBONSAI_API_PROXY_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig(({ command, mode }) => {
	// Fail dev and build early on a missing or malformed VITE_ setting.
	parseEnv(loadEnv(mode, process.cwd(), "VITE_"));
	return config(command, mode);
});

function config(command: string, mode: string) {
	return {
		plugins: [
			// Tailwind plugin
			tailwindcss(),

			// Vitest uses @vitejs/plugin-react, React Router uses @react-router/dev/vite
			process.env.VITEST ? react() : reactRouter(),

			// "npm run build:analyze" includes Vite bundle visualizer plugin and outputs to build/stats.html
			command === "build" &&
				mode === "analyze" &&
				visualizer({
					template: "treemap",
					gzipSize: true,
					emitFile: true,
				}),
		].filter(Boolean),

		// Localhost only: the proxy would otherwise expose the backend, which binds
		// 127.0.0.1, to the network. The container passes --host itself.
		server: {
			port: 5173, // "npm run dev" serves here; infra/local maps it to 15173
			proxy: {
				"/api": apiTarget,
				"/oauth2": apiTarget,
				"/login/oauth2": apiTarget,
			},
		},

		preview: {
			port: 4000, // "npm run build && npm run preview" will serve the production build preview on this port
		},

		resolve: {
			tsconfigPaths: true,
		},

		test: {
			reporters: ["default"],
			globals: true,
			setupFiles: ["./vitest-setup.ts"],
			environment: "jsdom",
			coverage: {
				include: ["src/**/*.{ts,tsx}"],
				exclude: ["src/**/+types/**", "src/**/*.test.{ts,tsx}"],
			},
		},
	};
}
