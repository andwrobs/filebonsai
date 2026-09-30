import {
	File,
	FileArchive,
	FileCode,
	FileHeadphone,
	FileImage,
	FilePlay,
	FileSpreadsheet,
	FileText,
	Folder,
	type LucideIcon,
	Presentation,
} from "lucide-react";
import { cn } from "~/lib/ui/utils";
import type { KindFamily } from "../entries";

const icons: Record<KindFamily, LucideIcon> = {
	folder: Folder,
	image: FileImage,
	pdf: FileText,
	document: FileText,
	spreadsheet: FileSpreadsheet,
	presentation: Presentation,
	archive: FileArchive,
	audio: FileHeadphone,
	video: FilePlay,
	code: FileCode,
	text: FileText,
	file: File,
};

const colors: Record<KindFamily, string> = {
	folder: "text-kind-folder",
	image: "text-kind-image",
	pdf: "text-kind-pdf",
	document: "text-kind-document",
	spreadsheet: "text-kind-spreadsheet",
	presentation: "text-kind-presentation",
	archive: "text-kind-archive",
	audio: "text-kind-audio",
	video: "text-kind-video",
	code: "text-kind-code",
	text: "text-kind-document",
	file: "text-kind-file",
};

// Decorative: every view also shows the kind or name as text.
export function EntryIcon({
	className,
	family,
	strokeWidth = 1.75,
}: {
	className?: string;
	family: KindFamily;
	strokeWidth?: number;
}) {
	const Icon = icons[family];
	return (
		<Icon
			aria-hidden="true"
			className={cn("entry-icon size-5 shrink-0", colors[family], className)}
			strokeWidth={strokeWidth}
		/>
	);
}
