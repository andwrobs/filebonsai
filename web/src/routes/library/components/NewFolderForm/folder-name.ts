// The server has the final say (NFC, 1–255 UTF-8 bytes, no separators); this
// catches the obvious cases before a request.
export function validateFolderName(value: string) {
	if (!value) return "Enter a folder name.";
	if (value.length > 255)
		return "Folder names must be 255 characters or fewer.";
	return undefined;
}
