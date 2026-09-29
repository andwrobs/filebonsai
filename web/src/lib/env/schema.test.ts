import { expect, it } from "vitest";
import { parseEnv } from "./schema";

it("leaves optional settings unset and accepts known values", () => {
	expect(parseEnv({})).toEqual({});
	expect(parseEnv({ VITE_FILEBONSAI_OIDC: "" })).toEqual({});
	expect(parseEnv({ VITE_FILEBONSAI_OIDC: "authentik" })).toEqual({
		VITE_FILEBONSAI_OIDC: "authentik",
	});
});

it("names the setting and the fix when a value is wrong", () => {
	expect(() => parseEnv({ VITE_FILEBONSAI_OIDC: "okta" })).toThrow(
		/VITE_FILEBONSAI_OIDC: Use authentik, or leave it unset\./,
	);
});
