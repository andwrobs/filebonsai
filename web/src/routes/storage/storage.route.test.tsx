import { screen } from "@testing-library/react";
import { Link, Outlet } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RouteFocus } from "~/lib/app/RouteFocus";
import { renderRoute } from "../../../test-utils/render-route";
import { apiError, stubApi } from "../../../test-utils/stub-api";
import StorageRoute, { meta } from "./storage.route";

afterEach(() => vi.unstubAllGlobals());

const summary = {
	connection: { displayName: "Family archive", providerKind: "r2" },
	capabilities: {
		sha256Verification: true,
		resumableUploads: false,
		rangeDownloads: false,
	},
	usedBytes: "1536",
};

function renderStorage() {
	return renderRoute([
		{ path: "/", Component: StorageRoute, meta },
		{ path: "/sign-in", Component: () => <h1>Sign in</h1> },
	]);
}

it("describes the connection, stored bytes, the upload limit, and capabilities", async () => {
	stubApi((path) =>
		path === "/api/v1/storage"
			? Response.json(summary)
			: Response.json({ maximumBytes: "134217728" }),
	);
	renderStorage();
	expect(await screen.findByText("Family archive")).toBeInTheDocument();
	expect(document.title).toBe("Storage · Filebonsai");
	expect(screen.getByText("Cloudflare R2")).toBeInTheDocument();
	expect(screen.getByText("1.5 KB")).toBeInTheDocument();
	expect(screen.getByText("128 MB")).toBeInTheDocument();
	expect(
		screen.getByText("An interrupted upload is sent again from byte zero."),
	).toBeInTheDocument();
});

it("still describes the connection when only the limit read fails", async () => {
	stubApi((path) =>
		path === "/api/v1/storage"
			? Response.json(summary)
			: apiError(500, "INTERNAL_ERROR"),
	);
	renderStorage();
	expect(await screen.findByText("Family archive")).toBeInTheDocument();
	expect(screen.getByText("Unavailable")).toBeInTheDocument();
	expect(
		screen.getByText(
			"The limit could not be read right now. The server still enforces it when you upload.",
		),
	).toBeInTheDocument();
});

it("shows a server error with its request ID, then recovers on Try again", async () => {
	let fail = true;
	stubApi((path) => {
		if (path === "/api/v1/storage") {
			return fail
				? apiError(500, "INTERNAL_ERROR", "Request could not be processed")
				: Response.json(summary);
		}
		return Response.json({ maximumBytes: "134217728" });
	});
	const { user } = renderStorage();
	expect(
		await screen.findByRole("heading", {
			name: "Could not load storage details",
		}),
	).toBeInTheDocument();
	expect(screen.getByText("Request ID: request-500")).toBeInTheDocument();
	fail = false;
	await user.click(screen.getByRole("button", { name: "Try again" }));
	expect(await screen.findByText("Family archive")).toBeInTheDocument();
});

it("calls an unreachable server unavailable", async () => {
	stubApi(() => {
		throw new TypeError("offline");
	});
	renderStorage();
	expect(
		await screen.findByRole("heading", {
			name: "Storage details are unavailable",
		}),
	).toBeInTheDocument();
});

it("sends a signed-out visitor to sign in", async () => {
	stubApi(() => apiError(401, "AUTH_REQUIRED"));
	renderStorage();
	expect(
		await screen.findByRole("heading", { name: "Sign in" }),
	).toBeInTheDocument();
});

it("keeps focus on the heading when details finish loading after navigation", async () => {
	let answer!: () => void;
	const answered = new Promise<void>((resolve) => {
		answer = resolve;
	});
	stubApi(async (path) => {
		await answered;
		return path === "/api/v1/storage"
			? Response.json(summary)
			: Response.json({ maximumBytes: "134217728" });
	});
	const { user } = renderRoute([
		{
			Component: () => (
				<main>
					<RouteFocus />
					<Outlet />
				</main>
			),
			children: [
				{ path: "/", Component: () => <Link to="/storage">Storage</Link> },
				{ path: "/storage", Component: StorageRoute },
			],
		},
	]);
	await user.click(screen.getByRole("link", { name: "Storage" }));
	expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
	answer();
	expect(await screen.findByText("Family archive")).toBeInTheDocument();
	expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
});

it("reports a failure on a later visit instead of showing earlier values", async () => {
	let fail = false;
	stubApi((path) => {
		if (fail)
			return apiError(500, "INTERNAL_ERROR", "Request could not be processed");
		return path === "/api/v1/storage"
			? Response.json(summary)
			: Response.json({ maximumBytes: "134217728" });
	});
	const { user } = renderRoute([
		{
			Component: () => (
				<>
					<Link to="/">Home</Link>
					<Outlet />
				</>
			),
			children: [
				{ path: "/", Component: () => <Link to="/storage">Open storage</Link> },
				{ path: "/storage", Component: StorageRoute },
			],
		},
	]);
	await user.click(screen.getByRole("link", { name: "Open storage" }));
	expect(await screen.findByText("Family archive")).toBeInTheDocument();
	await user.click(screen.getByRole("link", { name: "Home" }));
	fail = true;
	await user.click(screen.getByRole("link", { name: "Open storage" }));
	expect(
		await screen.findByRole("heading", {
			name: "Could not load storage details",
		}),
	).toBeInTheDocument();
	expect(screen.queryByText("Family archive")).not.toBeInTheDocument();
});
