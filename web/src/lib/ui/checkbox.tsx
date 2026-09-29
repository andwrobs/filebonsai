import { CheckIcon, MinusIcon } from "lucide-react";
import {
	CheckboxButton as CheckboxButtonPrimitive,
	type CheckboxButtonProps,
	CheckboxField as CheckboxFieldPrimitive,
	type CheckboxFieldProps,
	Checkbox as CheckboxPrimitive,
	type CheckboxProps,
	type CheckboxRenderProps,
	composeRenderProps,
} from "react-aria-components";
import { cn } from "~/lib/ui/utils";

const checkboxClassName =
	"peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-focus-visible:border-ring data-focus-visible:ring-3 data-focus-visible:ring-ring/50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-invalid:border-destructive/50 dark:data-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground data-invalid:data-selected:border-primary dark:data-selected:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:data-indeterminate:bg-primary";

function CheckboxIndicator({
	isSelected,
	isIndeterminate,
}: Pick<CheckboxRenderProps, "isSelected" | "isIndeterminate">) {
	return (
		<span
			data-slot="checkbox-indicator"
			className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
		>
			{isIndeterminate ? <MinusIcon /> : isSelected ? <CheckIcon /> : null}
		</span>
	);
}

function Checkbox({ className, children, ...props }: CheckboxProps) {
	return (
		<CheckboxPrimitive
			data-slot="checkbox"
			className={cn(checkboxClassName, className)}
			{...props}
		>
			{composeRenderProps(children, (children, renderProps) => (
				<>
					<CheckboxIndicator {...renderProps} />
					{children}
				</>
			))}
		</CheckboxPrimitive>
	);
}

// A checkbox with its own label, description, and error. Put CheckboxButton,
// FieldDescription, and FieldError inside so Aria links them to the input.
function CheckboxField({ className, ...props }: CheckboxFieldProps) {
	return (
		<CheckboxFieldPrimitive
			data-slot="field"
			className={composeRenderProps(className, (className) =>
				cn(
					"group/field flex w-full flex-col gap-2 data-[invalid=true]:text-destructive",
					className,
				),
			)}
			{...props}
		/>
	);
}

// The clickable label of a CheckboxField: the box plus its label text.
function CheckboxButton({
	className,
	children,
	...props
}: CheckboxButtonProps) {
	return (
		<CheckboxButtonPrimitive
			data-slot="field-label"
			className={composeRenderProps(className, (className) =>
				cn(
					"group/field-label flex w-fit items-center gap-2 text-sm leading-snug font-medium select-none data-disabled:opacity-50",
					className,
				),
			)}
			{...props}
		>
			{composeRenderProps(children, (children, renderProps) => (
				<>
					<span
						data-slot="checkbox"
						data-selected={renderProps.isSelected || undefined}
						data-indeterminate={renderProps.isIndeterminate || undefined}
						data-focus-visible={renderProps.isFocusVisible || undefined}
						data-invalid={renderProps.isInvalid || undefined}
						data-disabled={renderProps.isDisabled || undefined}
						className={checkboxClassName}
					>
						<CheckboxIndicator {...renderProps} />
					</span>
					{children}
				</>
			))}
		</CheckboxButtonPrimitive>
	);
}

export { Checkbox, CheckboxButton, CheckboxField };
