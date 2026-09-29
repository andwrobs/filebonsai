import { ApiError } from "~/lib/api/api";

/** What a failed sign-in tells the person; the password is never echoed. */
export function signInFailure(error: unknown) {
	if (error instanceof ApiError && error.kind === "http") {
		if (error.status === 429)
			return "Too many attempts. Wait before trying again.";
		if (error.status === 401) return "Password not recognized. Try again.";
		return "Could not sign in. Please try again.";
	}
	return "Could not connect. Check the server and try again.";
}
