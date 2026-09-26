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
  Presentation,
  type LucideIcon,
} from "lucide-react";

import type { KindFamily } from "./catalog-data.js";

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

// Decorative: the row always shows the kind as text too.
export function EntryIcon({ family }: { family: KindFamily }) {
  const Icon = icons[family];
  return <Icon aria-hidden="true" className={`entry-icon kind-${family}`} strokeWidth={1.75} />;
}
