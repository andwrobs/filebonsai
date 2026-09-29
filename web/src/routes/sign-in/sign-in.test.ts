import { expect, it } from "vitest";
import { ApiError } from "~/lib/api/api";
import { signInFailure } from "./sign-in";

const http = (status: number) => new ApiError("http", "failed", "", status);

it("tells throttling, a wrong password, and an unreachable server apart", () => {
	expect(signInFailure(http(429))).toBe(
		"Too many attempts. Wait before trying again.",
	);
	expect(signInFailure(http(401))).toBe("Password not recognized. Try again.");
	expect(signInFailure(http(500))).toBe("Could not sign in. Please try again.");
	expect(signInFailure(new ApiError("network", "offline", ""))).toBe(
		"Could not connect. Check the server and try again.",
	);
	expect(signInFailure(new TypeError("offline"))).toBe(
		"Could not connect. Check the server and try again.",
	);
});
