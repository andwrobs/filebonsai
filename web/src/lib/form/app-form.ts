import { createFormHook } from "@tanstack/react-form";
import {
	CheckboxField,
	Form,
	SelectField,
	SubmitButton,
	TextareaField,
	TextField,
} from "./fields";
import { fieldContext, formContext } from "./form-context";

export const { useAppForm, withForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: { CheckboxField, SelectField, TextareaField, TextField },
	formComponents: { Form, SubmitButton },
});
