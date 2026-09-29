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
		<section className="folder-form" aria-labelledby="new-folder-heading">
			<h2 id="new-folder-heading">Create folder</h2>
			<p className="folder-form-hint">
				Names are preserved exactly as entered.
			</p>
			<form
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
						<label className="field" htmlFor={nameId}>
							<span className="field-label">Folder name</span>
							<input
								// biome-ignore lint/a11y/noAutofocus: the person just asked to name a new folder.
								autoFocus
								id={nameId}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								value={field.state.value}
							/>
							{field.state.meta.errors.length ? (
								<span className="field-error">
									{field.state.meta.errors.join(" ")}
								</span>
							) : null}
						</label>
					)}
				</form.Field>
				<div className="form-actions">
					<button className="button secondary" onClick={onCancel} type="button">
						Cancel
					</button>
					<form.Subscribe selector={(state) => state.canSubmit}>
						{(canSubmit) => (
							<button
								className="button primary"
								disabled={!canSubmit || pending}
								type="submit"
							>
								{pending ? "Creating…" : "Create folder"}
							</button>
						)}
					</form.Subscribe>
				</div>
			</form>
			{error ? (
				<p className="form-error" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
