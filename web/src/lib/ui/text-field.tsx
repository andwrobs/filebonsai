import {
	composeRenderProps,
	TextField as TextFieldPrimitive,
	type TextFieldProps,
} from "react-aria-components";
import { fieldVariants } from "~/lib/ui/field";
import { cn } from "~/lib/ui/utils";

// Aria TextField with the shadcn Field layout. Put FieldLabel, Input or
// Textarea, FieldDescription, and FieldError inside; Aria links them.
function TextField({ className, ...props }: TextFieldProps) {
	return (
		<TextFieldPrimitive
			data-slot="field"
			className={composeRenderProps(className, (className) =>
				cn(fieldVariants({ orientation: "vertical" }), className),
			)}
			{...props}
		/>
	);
}

export { TextField };
