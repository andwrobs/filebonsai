import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { useAppForm } from "./app-form";

const schema = z.object({
	name: z.string().min(3, "Use at least 3 characters."),
	agree: z.literal(true, "Agree to continue."),
});

function SampleForm({ onSubmit }: { onSubmit: () => Promise<void> }) {
	const form = useAppForm({
		defaultValues: { name: "", agree: false },
		validators: { onChange: schema },
		onSubmit,
	});
	return (
		<form.AppForm>
			<form.Form>
				<form.AppField name="name">
					{(field) => (
						<field.TextField label="Name" description="Your display name." />
					)}
				</form.AppField>
				<form.AppField name="agree">
					{(field) => <field.CheckboxField label="I agree" />}
				</form.AppField>
				<form.SubmitButton>Send</form.SubmitButton>
			</form.Form>
		</form.AppForm>
	);
}

it("links descriptions, and shows linked errors after blur or submit", async () => {
	const user = userEvent.setup();
	render(<SampleForm onSubmit={vi.fn()} />);
	const name = screen.getByRole("textbox", { name: "Name" });
	expect(name).toHaveAccessibleDescription("Your display name.");

	await user.type(name, "ab");
	expect(name).not.toHaveAttribute("aria-invalid");
	await user.tab();
	expect(name).toHaveAttribute("aria-invalid", "true");
	expect(name).toHaveAccessibleDescription(
		"Your display name. Use at least 3 characters.",
	);

	const agree = screen.getByRole("checkbox", { name: "I agree" });
	expect(agree).not.toHaveAttribute("aria-invalid");
	await user.click(screen.getByRole("button", { name: "Send" }));
	expect(agree).toHaveAccessibleDescription("Agree to continue.");
});

it("submits once while a submission is pending", async () => {
	const user = userEvent.setup();
	let finish: () => void = () => undefined;
	const onSubmit = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	render(<SampleForm onSubmit={onSubmit} />);
	await user.type(screen.getByRole("textbox", { name: "Name" }), "Sam");
	await user.click(screen.getByRole("checkbox", { name: "I agree" }));
	await user.click(screen.getByRole("button", { name: "Send" }));
	const form = screen.getByRole("button", { name: "Send" }).closest("form");
	if (form) fireEvent.submit(form);
	expect(onSubmit).toHaveBeenCalledTimes(1);
	finish();
});

it("moves focus to the first invalid field on an invalid submit", async () => {
	const user = userEvent.setup();
	const onSubmit = vi.fn();
	render(<SampleForm onSubmit={onSubmit} />);
	await user.click(screen.getByRole("button", { name: "Send" }));
	expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
	expect(onSubmit).not.toHaveBeenCalled();
});
