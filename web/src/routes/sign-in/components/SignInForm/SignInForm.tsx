import { env } from "~/lib/env/env";
import { SignInFormView } from "./SignInFormView";
import { useSignIn } from "./useSignIn";

export function SignInForm() {
	const props = useSignIn();
	return (
		<SignInFormView
			{...props}
			offerAuthentik={env.VITE_FILEBONSAI_OIDC === "authentik"}
		/>
	);
}
