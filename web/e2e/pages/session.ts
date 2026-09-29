import { expect } from "@playwright/test";
import { Screen } from "./screen";

export class Session extends Screen {
	/**
	 * Ends the session. The web client has no sign-out control yet (backlog
	 * M1-14), so this does what its AccessService.logout does, from the page:
	 * read a CSRF token and POST /api/v1/auth/logout with the session cookie.
	 * Switch it to the control once the shell has one.
	 */
	async signOut() {
		const status = await this.page.evaluate(async () => {
			const csrf = await fetch("/api/v1/auth/csrf", { credentials: "include" });
			const { token } = (await csrf.json()) as { token: string };
			const logout = await fetch("/api/v1/auth/logout", {
				method: "POST",
				credentials: "include",
				headers: { "X-CSRF-TOKEN": token },
			});
			return logout.status;
		});
		expect(status, "logout status").toBeLessThan(300);
	}

	/** The browser's cookies no longer open a session. */
	async expectSignedOut() {
		const me = await this.page.request.get("/api/v1/auth/me");
		expect(me.status(), "GET /api/v1/auth/me after sign-out").toBe(401);
	}
}
