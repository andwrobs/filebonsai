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

const icons: Record<KindFamily, { Icon: LucideIcon; color: string }> = {
	folder: { Icon: Folder, color: "text-kind-folder" },
	image: { Icon: FileImage, color: "text-kind-image" },
	pdf: { Icon: FileText, color: "text-kind-pdf" },
	document: { Icon: FileText, color: "text-kind-document" },
	spreadsheet: { Icon: FileSpreadsheet, color: "text-kind-spreadsheet" },
	presentation: { Icon: Presentation, color: "text-kind-presentation" },
	archive: { Icon: FileArchive, color: "text-kind-archive" },
	audio: { Icon: FileHeadphone, color: "text-kind-audio" },
	video: { Icon: FilePlay, color: "text-kind-video" },
	code: { Icon: FileCode, color: "text-kind-code" },
	text: { Icon: FileText, color: "text-kind-document" },
	file: { Icon: File, color: "text-kind-file" },
};

// Decorative: the row always shows the kind as text too. `entry-icon` lets the
// inspector's app.css rule size it until the inspector moves (LIB-15).
export function EntryIcon({
	className,
	family,
}: {
	className?: string;
	family: KindFamily;
}) {
	const { Icon, color } = icons[family];
	return (
		<Icon
			aria-hidden="true"
			className={cn("entry-icon size-5", color, className)}
			strokeWidth={1.75}
		/>
	);
}
