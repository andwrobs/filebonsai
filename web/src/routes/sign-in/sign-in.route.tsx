import { redirect } from "react-router";
import { isUnauthorized } from "~/lib/api/api";
import { pageTitle } from "~/lib/meta/title";
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

export default function SignInRoute() {
	return (
		<main className="sign-in-shell">
			<SignInForm />
		</main>
	);
}

export function ErrorBoundary() {
	return (
		<main className="sign-in-shell">
			<div className="page-message" role="alert">
				<p className="eyebrow">Unavailable</p>
				<h1>Sign-in is unavailable</h1>
				<p>Check the server connection, then try again.</p>
				<a className="button primary" href="/sign-in">
					Try again
				</a>
			</div>
		</main>
	);
}
