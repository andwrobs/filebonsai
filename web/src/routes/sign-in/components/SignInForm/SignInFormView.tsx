import type { useSignIn } from "./useSignIn";

export type SignInFormProps = ReturnType<typeof useSignIn> & {
	offerAuthentik: boolean;
};

export function SignInFormView({
	busy,
	message,
	offerAuthentik,
	signIn,
}: SignInFormProps) {
	return (
		<section className="sign-in-card" aria-labelledby="sign-in-heading">
			<img
				alt="Filebonsai"
				className="sign-in-brand"
				src="/brand/filebonsai-lockup.svg"
			/>
			<h1 id="sign-in-heading">Sign in</h1>
			<p className="sign-in-intro">
				Enter the password for the local owner account.
			</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					const input = event.currentTarget.elements.namedItem(
						"password",
					) as HTMLInputElement;
					signIn(input.value, () => {
						input.value = "";
					});
				}}
			>
				<label htmlFor="owner-password">Password</label>
				<input
					autoComplete="current-password"
					// biome-ignore lint/a11y/noAutofocus: signing in is the only thing this page does.
					autoFocus
					id="owner-password"
					name="password"
					required
					type="password"
				/>
				{message ? (
					<p className="form-error" role="alert">
						{message}
					</p>
				) : null}
				<button className="button primary" disabled={busy} type="submit">
					{busy ? "Signing in…" : "Sign in"}
				</button>
			</form>
			{offerAuthentik ? (
				<a
					className="button secondary sign-in-oidc"
					href="/oauth2/authorization/authentik"
				>
					Continue with Authentik
				</a>
			) : null}
			<p className="sign-in-help">
				First time here? Ask the server operator to set up the owner account.
			</p>
		</section>
	);
}
