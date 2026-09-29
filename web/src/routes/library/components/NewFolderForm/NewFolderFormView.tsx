import { Button } from "~/lib/ui/button";
import { Input } from "~/lib/ui/input";
import { validateFolderName } from "./folder-name";
import type { useNewFolderForm } from "./useNewFolderForm";

export type NewFolderFormProps = ReturnType<typeof useNewFolderForm> & {
	onCancel: () => void;
};

const errorClassName = "text-sm font-semibold text-destructive";

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
			className="grid max-w-[42rem] gap-2 rounded-lg border bg-secondary p-4"
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
						// The label wraps the error too, so it is read with the field's name.
						<label
							className="grid min-w-0 flex-[1_1_16rem] gap-1"
							htmlFor={nameId}
						>
							<span className="text-sm font-semibold">Folder name</span>
							<Input
								// The person just asked to name a new folder.
								autoFocus
								// Filebonsai's control: the card surface at the control height, 1rem
								// typed text so iOS doesn't zoom, and the app's focus outline.
								className="h-auto min-h-control rounded-md bg-card px-3 py-0 text-[1rem] focus-visible:border-input focus-visible:ring-0 focus-visible:outline-solid md:text-[1rem]"
								id={nameId}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								value={field.state.value}
							/>
							{field.state.meta.errors.length ? (
								<span className={errorClassName}>
									{field.state.meta.errors.join(" ")}
								</span>
							) : null}
						</label>
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
				<p className={errorClassName} role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
