import { Alert } from "~/lib/ui/alert";
import { Button, buttonVariants } from "~/lib/ui/button";
import { cn } from "~/lib/ui/utils";
import type { useSignIn } from "./useSignIn";

export type SignInFormProps = ReturnType<typeof useSignIn> & {
	offerAuthentik: boolean;
};

export function SignInFormView({
	busy,
	form,
	message,
	offerAuthentik,
}: SignInFormProps) {
	return (
		<section
			className="w-full max-w-[26rem] rounded-lg border bg-card p-[clamp(1.5rem,5vw,2.5rem)] shadow-raised"
			aria-labelledby="sign-in-heading"
		>
			<img
				alt="Filebonsai"
				className="mb-8 block h-auto w-52 max-w-full"
				src="/brand/filebonsai-lockup.svg"
			/>
			<h1
				id="sign-in-heading"
				className="mb-2 text-2xl leading-normal font-semibold"
			>
				Sign in
			</h1>
			<p className="text-md text-muted-foreground">
				Enter the password for the local owner account.
			</p>
			<form.AppForm>
				<form.Form className="mt-6 grid gap-2">
					<form.AppField name="password">
						{(field) => (
							<field.TextField
								autoComplete="current-password"
								// Signing in is the only thing this page does.
								autoFocus
								isRequired
								label="Password"
								type="password"
							/>
						)}
					</form.AppField>
					{message ? (
						<Alert variant="destructive" className="border-0 p-0 font-semibold">
							{message}
						</Alert>
					) : null}
					<Button
						className="mt-2 min-h-touch w-full"
						isDisabled={busy}
						type="submit"
					>
						{busy ? "Signing in…" : "Sign in"}
					</Button>
				</form.Form>
			</form.AppForm>
			{offerAuthentik ? (
				// A full page load: the server runs the Authentik redirect, not the router.
				<a
					className={cn(
						buttonVariants({ variant: "outline" }),
						"mt-2 min-h-touch w-full",
					)}
					href="/oauth2/authorization/authentik"
				>
					Continue with Authentik
				</a>
			) : null}
			<p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
				First time here? Ask the server operator to set up the owner account.
			</p>
		</section>
	);
}
