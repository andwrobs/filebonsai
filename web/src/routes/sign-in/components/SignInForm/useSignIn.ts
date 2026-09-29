import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { accessService } from "~/services";
import { signInFailure } from "../../sign-in";

/** Owns one sign-in attempt at a time and where a successful one leads. */
export function useSignIn() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const signIn = useMutation({
		mutationFn: (password: string) => accessService.login(password),
		onSuccess: () => {
			// A new session: nothing cached before sign-in may show after it.
			queryClient.clear();
			void navigate("/", { replace: true });
		},
	});
	return {
		busy: signIn.isPending,
		message: signIn.isError ? signInFailure(signIn.error) : undefined,
		/** `forget` clears the password field once the attempt settles. */
		signIn(password: string, forget: () => void) {
			if (signIn.isPending) return;
			signIn.mutate(password, { onSettled: forget });
		},
	};
}
