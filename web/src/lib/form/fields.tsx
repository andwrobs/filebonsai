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
	placeholder,
}: FieldProps & {
	type?: "text" | "email" | "tel" | "url";
	autoComplete?: string;
	placeholder?: string;
}) {
	const field = useFieldContext<string>();
	const errors = useVisibleErrors();
	return (
		<TextFieldRoot
			name={field.name}
			type={type}
			autoComplete={autoComplete}
			value={field.state.value}
			onChange={field.handleChange}
			onBlur={field.handleBlur}
			isRequired={isRequired}
			isInvalid={errors.length > 0}
			validationBehavior="aria"
		>
			<FieldLabel>{label}</FieldLabel>
			<Input placeholder={placeholder} />
			{description && <FieldDescription>{description}</FieldDescription>}
			<FieldError errors={errors} />
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
				// A rejected submit belongs to the submission owner (a Query mutation
				// or fetcher), which renders the failure.
				form.handleSubmit().catch(() => undefined);
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
