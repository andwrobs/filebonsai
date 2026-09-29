import { useStore } from "@tanstack/react-form";
import { LoaderCircleIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "~/lib/ui/button";
import {
	CheckboxButton,
	CheckboxField as CheckboxFieldRoot,
} from "~/lib/ui/checkbox";
import {
	FieldDescription,
	FieldError,
	FieldLabel,
	fieldVariants,
} from "~/lib/ui/field";
import { Input } from "~/lib/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/lib/ui/select";
import { TextField as TextFieldRoot } from "~/lib/ui/text-field";
import { Textarea } from "~/lib/ui/textarea";
import { useFieldContext, useFormContext } from "./form-context";

// TanStack owns value, touched state, and validation; Aria owns labels, ids,
// and keyboard. validationBehavior="aria" keeps the browser from validating too.

type FieldProps = {
	label: string;
	description?: ReactNode;
	isRequired?: boolean;
};

// Filebonsai's field look: small semibold labels and errors, and controls at the
// control height with 1rem text (so iOS doesn't zoom) and the app's focus outline
// in place of lib/ui's focus ring.
const labelClassName = "text-sm font-semibold leading-normal";
const errorClassName = "font-semibold";
const inputClassName =
	"h-auto min-h-control rounded-md bg-card px-3 py-0 text-[1rem] md:text-[1rem] focus-visible:border-input focus-visible:ring-0 focus-visible:outline-solid";

// Errors show once the field is blurred or the form has been submitted.
function useVisibleErrors() {
	const field = useFieldContext<unknown>();
	const submitted = useStore(
		field.form.store,
		(state) => state.submissionAttempts > 0,
	);
	return field.state.meta.isBlurred || submitted ? field.state.meta.errors : [];
}

function TextField({
	label,
	description,
	isRequired,
	type = "text",
	autoComplete,
	autoFocus,
	placeholder,
}: FieldProps & {
	type?: "text" | "email" | "tel" | "url" | "password";
	autoComplete?: string;
	/** For a page or dialog whose only job is this form. */
	autoFocus?: boolean;
	placeholder?: string;
}) {
	const field = useFieldContext<string>();
	const errors = useVisibleErrors();
	return (
		<TextFieldRoot
			name={field.name}
			type={type}
			autoComplete={autoComplete}
			autoFocus={autoFocus}
			value={field.state.value}
			onChange={field.handleChange}
			onBlur={field.handleBlur}
			isRequired={isRequired}
			isInvalid={errors.length > 0}
			validationBehavior="aria"
		>
			<FieldLabel className={labelClassName}>{label}</FieldLabel>
			<Input className={inputClassName} placeholder={placeholder} />
			{description && <FieldDescription>{description}</FieldDescription>}
			<FieldError className={errorClassName} errors={errors} />
		</TextFieldRoot>
	);
}

function TextareaField({
	label,
	description,
	isRequired,
	placeholder,
}: FieldProps & { placeholder?: string }) {
	const field = useFieldContext<string>();
	const errors = useVisibleErrors();
	return (
		<TextFieldRoot
			name={field.name}
			value={field.state.value}
			onChange={field.handleChange}
			onBlur={field.handleBlur}
			isRequired={isRequired}
			isInvalid={errors.length > 0}
			validationBehavior="aria"
		>
			<FieldLabel>{label}</FieldLabel>
			<Textarea placeholder={placeholder} />
			{description && <FieldDescription>{description}</FieldDescription>}
			<FieldError errors={errors} />
		</TextFieldRoot>
	);
}

function SelectField({
	label,
	description,
	isRequired,
	placeholder,
	options,
}: FieldProps & {
	placeholder?: string;
	options: ReadonlyArray<{ value: string; label: string }>;
}) {
	const field = useFieldContext<string>();
	const errors = useVisibleErrors();
	return (
		<Select
			name={field.name}
			placeholder={placeholder}
			value={field.state.value || null}
			onChange={(key) => field.handleChange(key === null ? "" : String(key))}
			onBlur={field.handleBlur}
			isRequired={isRequired}
			isInvalid={errors.length > 0}
			validationBehavior="aria"
			className={fieldVariants({ orientation: "vertical" })}
		>
			<FieldLabel>{label}</FieldLabel>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			{description && <FieldDescription>{description}</FieldDescription>}
			<FieldError errors={errors} />
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} id={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function CheckboxField({ label, description, isRequired }: FieldProps) {
	const field = useFieldContext<boolean>();
	const errors = useVisibleErrors();
	return (
		<CheckboxFieldRoot
			name={field.name}
			isSelected={field.state.value}
			onChange={field.handleChange}
			onBlur={field.handleBlur}
			isRequired={isRequired}
			isInvalid={errors.length > 0}
			validationBehavior="aria"
		>
			<CheckboxButton>{label}</CheckboxButton>
			{description && <FieldDescription>{description}</FieldDescription>}
			<FieldError errors={errors} />
		</CheckboxFieldRoot>
	);
}

// As the browser does for its own validation, an invalid submit moves focus to the
// first control whose field has errors.
function focusFirstInvalid(
	element: HTMLFormElement,
	form: ReturnType<typeof useFormContext>,
) {
	if (form.state.isValid) return;
	const meta: Record<string, { errors: unknown[] } | undefined> =
		form.state.fieldMeta;
	for (const control of element.elements) {
		const name = control.getAttribute("name");
		if (name && meta[name]?.errors.length) {
			(control as HTMLElement).focus();
			return;
		}
	}
}

function Form(props: Omit<ComponentProps<"form">, "onSubmit" | "noValidate">) {
	const form = useFormContext();
	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				// TanStack Form starts another submission if asked while one runs.
				if (form.state.isSubmitting) return;
				const element = event.currentTarget;
				// A rejected submit belongs to the submission owner (a Query mutation
				// or fetcher), which renders the failure.
				form.handleSubmit().then(
					() => focusFirstInvalid(element, form),
					() => undefined,
				);
			}}
			{...props}
		/>
	);
}

function SubmitButton({ children }: { children: ReactNode }) {
	const form = useFormContext();
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	return (
		<Button type="submit" isPending={isSubmitting}>
			{isSubmitting && (
				<LoaderCircleIcon
					data-icon="inline-start"
					aria-hidden
					className="animate-spin motion-reduce:animate-none"
				/>
			)}
			{children}
		</Button>
	);
}

export {
	CheckboxField,
	Form,
	SelectField,
	SubmitButton,
	TextareaField,
	TextField,
};
