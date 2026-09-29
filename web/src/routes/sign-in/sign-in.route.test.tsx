import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderRoute } from "../../../test-utils/render-route";
import { apiError, csrf, stubApi } from "../../../test-utils/stub-api";
import SignInRoute, {
	clientLoader,
	ErrorBoundary,
	meta,
} from "./sign-in.route";

afterEach(() => vi.unstubAllGlobals());

function renderSignIn(queryClient = new QueryClient()) {
	return renderRoute(
		[
			{
				path: "/sign-in",
				Component: SignInRoute,
				loader: clientLoader,
				meta,
				ErrorBoundary,
			},
			{ path: "/", Component: () => <h1>Library</h1> },
		],
		{ initialEntries: ["/sign-in"], queryClient },
	);
}

const session = () =>
	Response.json({
		expiresAt: "2026-09-30T00:00:00Z",
		principalId: "20000000-0000-4000-8000-000000000001",
	});

it("sends a signed-in visitor to the Library", async () => {
	stubApi(() => session());
	renderSignIn();
	expect(
		await screen.findByRole("heading", { name: "Library" }),
	).toBeInTheDocument();
});

it("names a wrong password, clears the field, then signs in", async () => {
	let accept = false;
	const { requests } = stubApi((path) => {
		if (path === "/api/v1/auth/me") return apiError(401, "AUTH_REQUIRED");
		if (path === "/api/v1/auth/csrf") return csrf();
		return accept ? session() : apiError(401, "INVALID_CREDENTIALS");
	});
	const { user } = renderSignIn();
	const password = await screen.findByLabelText("Password");
	expect(document.title).toBe("Sign in · Filebonsai");
	await user.type(password, "wrong");
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Password not recognized. Try again.",
	);
	expect(password).toHaveValue("");

	accept = true;
	await user.type(password, "correct horse battery staple");
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	expect(
		await screen.findByRole("heading", { name: "Library" }),
	).toBeInTheDocument();
	const logins = requests.filter((request) => request.url.endsWith("/login"));
	expect(logins.map((request) => request.headers.get("X-CSRF-TOKEN"))).toEqual([
		"test-csrf",
		"test-csrf",
	]);
});

it("names throttling", async () => {
	stubApi((path) => {
		if (path === "/api/v1/auth/me") return apiError(401, "AUTH_REQUIRED");
		if (path === "/api/v1/auth/csrf") return csrf();
		return apiError(429, "TOO_MANY_ATTEMPTS");
	});
	const { user } = renderSignIn();
	await user.type(await screen.findByLabelText("Password"), "guess");
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Too many attempts. Wait before trying again.",
	);
});

it("says sign-in is unavailable when the session can't be checked", async () => {
	stubApi(() => apiError(500, "INTERNAL_ERROR"));
	renderSignIn();
	expect(
		await screen.findByRole("heading", { name: "Sign-in is unavailable" }),
	).toBeInTheDocument();
});

it("keeps no password after an attempt and clears cached data on sign-in", async () => {
	let accept = false;
	stubApi((path) => {
		if (path === "/api/v1/auth/me") return apiError(401, "AUTH_REQUIRED");
		if (path === "/api/v1/auth/csrf") return csrf();
		return accept ? session() : apiError(401, "INVALID_CREDENTIALS");
	});
	const queryClient = new QueryClient();
	queryClient.setQueryData(["catalog", "root"], { id: "someone-elses-root" });
	const { user } = renderSignIn(queryClient);
	const password = await screen.findByLabelText("Password");
	await user.type(password, "wrong guess");
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	expect(await screen.findByRole("alert")).toBeInTheDocument();
	await vi.waitFor(() =>
		expect(queryClient.getMutationCache().getAll()).toHaveLength(0),
	);

	accept = true;
	await user.type(password, "correct horse battery staple");
	await user.click(screen.getByRole("button", { name: "Sign in" }));
	expect(
		await screen.findByRole("heading", { name: "Library" }),
	).toBeInTheDocument();
	expect(queryClient.getQueryData(["catalog", "root"])).toBeUndefined();
});
