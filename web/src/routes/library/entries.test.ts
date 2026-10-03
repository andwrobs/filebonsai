import { expect, it } from "vitest";
import {
	entryKind,
	entryMeta,
	formatFullDate,
	formatModified,
} from "./entries";

const folder = {
	createdAt: "2026-09-21T00:00:00Z",
	id: "00000000-0000-4000-8000-000000000001",
	kind: "folder" as const,
	name: "Library",
	parentId: null,
	updatedAt: "2026-09-21T00:00:00Z",
};

const now = new Date("2026-09-25T15:00:00Z");

it("shortens modified labels with recency", () => {
	const label = (iso: string) => formatModified(iso, now, "en-US", "UTC");
	expect(label("2026-09-25T09:05:00Z")).toBe("9:05 AM");
	expect(label("2026-09-24T23:59:00Z")).toBe("Yesterday");
	expect(label("2026-08-28T12:00:00Z")).toBe("Aug 28");
	expect(label("2025-12-31T12:00:00Z")).toBe("Dec 31, 2025");
	// Calendar days, not 24-hour spans: the spring-forward day had only 23 hours.
	expect(
		formatModified(
			"2026-03-08T12:00:00-06:00",
			new Date("2026-03-09T00:30:00-06:00"),
			"en-US",
			"America/Denver",
		),
	).toBe("Yesterday");
	expect(
		formatModified(
			"2026-01-01T12:00:00Z",
			new Date("2026-01-02T08:00:00Z"),
			"en-US",
			"UTC",
		),
	).toBe("Yesterday");
});

it("leads compact meta with size for files and kind for folders", () => {
	const file = {
		...folder,
		family: "image",
		kind: "file" as const,
		name: "IMG_8421.JPG",
		parentId: folder.id,
		updatedAt: "2026-08-28T12:00:00Z",
		currentVersion: {
			id: "00000000-0000-4000-8000-000000000002",
			sha256: null,
			sizeBytes: "5505024",
			storageConnectionName: "Local disk",
		},
		versionCount: 1,
	};
	expect(entryMeta(folder, now, "en-US", "UTC")).toBe("Folder · Sep 21");
	expect(entryMeta(file, now, "en-US", "UTC")).toBe("5.2 MB · Aug 28");
});

it("shows the full date in details", () => {
	expect(formatFullDate("2026-08-28T16:31:00Z", "en-US", "UTC")).toBe(
		"Aug 28, 2026, 4:31 PM",
	);
});

it("labels the server's family and shows a family it does not know by name", () => {
	const file = {
		...folder,
		kind: "file" as const,
		name: "archive.tar.gz",
		parentId: folder.id,
		currentVersion: {
			id: "00000000-0000-4000-8000-000000000002",
			sha256: null,
			sizeBytes: "1",
			storageConnectionName: "Local disk",
		},
		versionCount: 1,
	};
	const kind = (family: string) => entryKind({ ...file, family });
	expect(entryKind(folder)).toEqual({ family: "folder", label: "Folder" });
	expect(kind("archive")).toEqual({ family: "archive", label: "Archive" });
	expect(kind("pdf")).toEqual({ family: "pdf", label: "PDF" });
	expect(kind("file")).toEqual({ family: "file", label: "File" });
	// The vocabulary is open: a newer server's family keeps its name and the plain icon.
	expect(kind("font")).toEqual({ family: "file", label: "Font" });
	// "folder" is never a file's family, so it cannot borrow the folder icon.
	expect(kind("folder")).toEqual({ family: "file", label: "Folder" });
});
