import { Button } from "~/lib/ui/button";
import { FieldError, FieldLabel } from "~/lib/ui/field";
import { Input } from "~/lib/ui/input";
import { TextField } from "~/lib/ui/text-field";
import { validateFolderName } from "./folder-name";
import type { useNewFolderForm } from "./useNewFolderForm";

export type NewFolderFormProps = ReturnType<typeof useNewFolderForm> & {
	onCancel: () => void;
};

export function NewFolderFormView({
	error,
	form,
	nameId,
	onCancel,
	pending,
	submit,
}: NewFolderFormProps) {
	return (
		<section
			className="grid max-w-2xl gap-2 rounded-lg border bg-secondary p-4"
			aria-labelledby="new-folder-heading"
		>
			<h2 className="text-md font-semibold" id="new-folder-heading">
				Create folder
			</h2>
			<p className="text-sm text-muted-foreground">
				Names are preserved exactly as entered.
			</p>
			<form
				className="mt-1 flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					submit();
				}}
			>
				<form.Field
					name="name"
					validators={{ onChange: ({ value }) => validateFolderName(value) }}
				>
					{(field) => (
						<TextField
							className="min-w-0 flex-[1_1_16rem] gap-1"
							isInvalid={field.state.meta.errors.length > 0}
							onBlur={field.handleBlur}
							onChange={field.handleChange}
							validationBehavior="aria"
							value={field.state.value}
						>
							<FieldLabel className="text-sm font-semibold text-foreground">
								Folder name
							</FieldLabel>
							<Input
								autoFocus
								id={nameId}
								className="h-auto min-h-control rounded-md bg-card px-3 text-[1rem] focus-visible:border-input focus-visible:ring-0 focus-visible:outline-solid aria-invalid:border-input aria-invalid:ring-0 md:text-[1rem]"
							/>
							{field.state.meta.errors.length ? (
								<FieldError className="font-semibold">
									{field.state.meta.errors.join(" ")}
								</FieldError>
							) : null}
						</TextField>
					)}
				</form.Field>
				<div className="flex flex-wrap gap-2">
					<Button onPress={onCancel} variant="outline">
						Cancel
					</Button>
					<form.Subscribe selector={(state) => state.canSubmit}>
						{(canSubmit) => (
							<Button isDisabled={!canSubmit || pending} type="submit">
								{pending ? "Creating…" : "Create folder"}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</form>
			{error ? (
				<p className="text-sm font-semibold text-destructive" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
