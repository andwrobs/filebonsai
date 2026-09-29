import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { expect } from "@playwright/test";
import type { SyntheticFile } from "../synthetic";
import { Screen } from "./screen";

// The Library screen: the folder heading, New folder, Upload, and file rows.
export class LibraryPage extends Screen {
	async expectFolder(name: string) {
		await expect(
			this.page.getByRole("heading", { level: 1, name, exact: true }),
		).toBeVisible();
	}

	async createFolder(name: string) {
		await this.press(this.page.getByRole("button", { name: "New folder" }));
		const form = this.page.getByRole("region", { name: "Create folder" });
		await form.getByLabel("Folder name").fill(name);
		await this.press(form.getByRole("button", { name: "Create folder" }));
		await expect(this.folderLink(name)).toBeVisible();
	}

	async openFolder(name: string) {
		await this.press(this.folderLink(name));
		await this.expectFolder(name);
	}

	/** Uploads through the file chooser and waits until the file is listed. */
	async upload(file: SyntheticFile) {
		// Phones upload from the floating button; wider layouts from the toolbar.
		const trigger = this.compact
			? this.page.getByRole("button", { name: "Upload files", exact: true })
			: this.page.getByRole("button", { name: "Upload", exact: true }).first();
		const chooser = this.page.waitForEvent("filechooser");
		await this.press(trigger);
		await (await chooser).setFiles({
			name: file.name,
			mimeType: file.mimeType,
			buffer: file.buffer,
		});
		await expect(this.downloadButton(file.name)).toBeVisible({
			timeout: 30_000,
		});
	}

	/** Downloads a listed file's original and returns what the browser saved. */
	async download(name: string) {
		const download = this.page.waitForEvent("download");
		await this.press(this.downloadButton(name));
		const saved = await download;
		expect(await saved.failure()).toBeNull();
		const digest = createHash("sha256");
		for await (const chunk of createReadStream(await saved.path())) {
			digest.update(chunk);
		}
		return {
			suggestedFilename: saved.suggestedFilename(),
			sha256: digest.digest("hex"),
		};
	}

	private folderLink(name: string) {
		return this.page.getByRole("link", { name, exact: true });
	}

	private downloadButton(name: string) {
		return this.page.getByRole("button", {
			name: `Download ${name}`,
			exact: true,
		});
	}
}
