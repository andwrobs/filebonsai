import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import { useAppForm } from "~/lib/form/app-form";
import { accessService } from "~/services";
import { signInFailure } from "../../sign-in";

const signInSchema = z.object({
	password: z.string().min(1, "Enter the password."),
});

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
	const form = useAppForm({
		defaultValues: { password: "" },
		validators: { onChange: signInSchema },
		onSubmit: async ({ value, formApi }) => {
			setMessage(undefined);
			try {
				await signIn.mutateAsync(value.password);
			} catch (error) {
				setMessage(signInFailure(error));
			} finally {
				// Clear the password field, and its validation, once the attempt settles.
				formApi.reset();
				signIn.reset();
			}
		},
	});
	return { busy: signIn.isPending, form, message };
}
