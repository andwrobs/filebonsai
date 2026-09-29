import { createHash } from "node:crypto";

export type SyntheticFile = {
	name: string;
	mimeType: string;
	buffer: Buffer;
	sha256: string;
};

// A deterministic, visibly synthetic body: a text header naming the fixture,
// then SHA-256 blocks of a counter, so no two labels share bytes.
export function syntheticFile(label: string, sizeBytes = 256 * 1024) {
	const blocks = [Buffer.from(`Filebonsai synthetic e2e fixture: ${label}\n`)];
	let length = blocks[0]?.length ?? 0;
	for (let counter = 0; length < sizeBytes; counter++) {
		const block = createHash("sha256").update(`${label}:${counter}`).digest();
		blocks.push(block);
		length += block.length;
	}
	const buffer = Buffer.concat(blocks).subarray(0, sizeBytes);
	return {
		name: `${label}.bin`,
		mimeType: "application/octet-stream",
		buffer,
		sha256: createHash("sha256").update(buffer).digest("hex"),
	} satisfies SyntheticFile;
}
