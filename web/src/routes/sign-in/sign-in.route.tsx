import { redirect } from "react-router";
import { isUnauthorized } from "~/lib/api/api";
import { pageTitle } from "~/lib/meta/title";
import { buttonVariants } from "~/lib/ui/button";
import { accessService } from "~/services";
import type { Route } from "./+types/sign-in.route";
import { SignInForm } from "./components/SignInForm";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("Sign in") }];

// A signed-in visitor goes straight to the Library.
export async function clientLoader() {
	try {
		await accessService.currentSession();
	} catch (error) {
		if (isUnauthorized(error)) return null;
		throw error;
	}
	return redirect("/");
}

const shellClassName =
	"grid min-h-dvh place-items-center bg-background px-4 py-8";

export default function SignInRoute() {
	return (
		<main className={shellClassName}>
			<SignInForm />
		</main>
	);
}

export function ErrorBoundary() {
	return (
		<main className={shellClassName}>
			<div
				className="mx-auto my-12 grid w-full max-w-[40rem] justify-items-start gap-3 px-gutter"
				role="alert"
			>
				{/* The text-size rules in index.css set letter-spacing, so tracking needs `!`. */}
				<p className="text-xs font-bold tracking-[0.08em]! text-muted-foreground uppercase">
					Unavailable
				</p>
				<h1 className="text-2xl font-semibold">Sign-in is unavailable</h1>
				<p className="text-muted-foreground">
					Check the server connection, then try again.
				</p>
				{/* A full page load retries the session check from scratch. */}
				<a className={buttonVariants()} href="/sign-in">
					Try again
				</a>
			</div>
		</main>
	);
}
