import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { errorMessage } from "~/lib/catalog/catalog";
import { catalogKeys } from "~/lib/catalog/catalog.query";
import { catalogService } from "~/services";

/**
 * Owns creating one folder in `parentId`: the draft, submission, failure, and
 * the refresh. `onCreated` runs only while this form is still showing, so a
 * late reply can't close a form that has moved to another folder.
 */
export function useNewFolderForm({
	parentId,
	onCreated,
}: {
	parentId: string;
	onCreated: () => void;
}) {
	const queryClient = useQueryClient();
	const nameId = useId();
	const create = useMutation({
		// Each submission is a new intent with its own idempotency key.
		mutationFn: (name: string) =>
			catalogService.createFolder({
				idempotencyKey: crypto.randomUUID(),
				name,
				parentId,
			}),
		// Refresh the folder the reply belongs to, whatever is showing now.
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: catalogKeys.folder(parentId),
			}),
	});
	const form = useForm({
		defaultValues: { name: "" },
		onSubmit: ({ value }) => {
			create.mutate(value.name, {
				onSuccess: () => {
					form.reset();
					onCreated();
				},
			});
		},
	});
	return {
		form,
		nameId,
		pending: create.isPending,
		error: create.isError
			? errorMessage(create.error, "The folder could not be created.")
			: undefined,
		submit: () => void form.handleSubmit(),
	};
}
