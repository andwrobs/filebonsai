import { z } from "zod";

// Every VITE_ setting the app reads. Vite inlines them into the client bundle,
// so they're public: never put secrets here. Keep .env.example in step.
//
// There is no API URL: the generated contract's /api/v1 paths are served from
// this origin, which the session cookie and CSRF protection rely on.
export const envSchema = z.object({
	VITE_FILEBONSAI_OIDC: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z.enum(["authentik"], "Use authentik, or leave it unset.").optional(),
	),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
	const result = envSchema.safeParse(source);
	if (result.success) return result.data;
	const problems = result.error.issues
		.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
		.join("\n");
	throw new Error(
		`Invalid environment settings:\n${problems}\nSee .env.example.`,
	);
}
