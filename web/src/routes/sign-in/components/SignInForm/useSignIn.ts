import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { accessService } from "~/services";
import { signInFailure } from "../../sign-in";

/** Owns one sign-in attempt at a time and where a successful one leads. */
export function useSignIn() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [message, setMessage] = useState<string>();
	const signIn = useMutation({
		mutationFn: (password: string) => accessService.login(password),
		// The password is the mutation's variables: keep nothing once it settles.
		gcTime: 0,
		onSuccess: () => {
			// A new session: nothing cached before sign-in may show after it.
			queryClient.clear();
			void navigate("/", { replace: true });
		},
	});
	return {
		busy: signIn.isPending,
		message,
		/** `forget` clears the password field once the attempt settles. */
		signIn(password: string, forget: () => void) {
			if (signIn.isPending) return;
			setMessage(undefined);
			signIn.mutate(password, {
				onError: (error) => setMessage(signInFailure(error)),
				onSettled: () => {
					forget();
					signIn.reset();
				},
			});
		},
	};
}
