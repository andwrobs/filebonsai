import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/ui/utils";

/**
 * A check circle shown in touch selection mode, where taps toggle; otherwise
 * the fallback (or nothing). Desktop selection shows as the item's tint.
 */
export function SelectionMark({
	className,
	fallback = null,
	selected,
	toggling,
}: {
	className?: string;
	fallback?: ReactNode;
	selected: boolean;
	toggling: boolean;
}) {
	if (!toggling) return fallback;
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-6 place-items-center rounded-full border-2",
				selected
					? "border-primary bg-primary text-primary-foreground"
					: "border-border-strong bg-background",
				className,
			)}
		>
			{selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
		</span>
	);
}
