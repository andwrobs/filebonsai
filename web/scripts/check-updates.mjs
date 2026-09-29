import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const lock = JSON.parse(
	await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
const queue = Object.entries(dependencies);
const results = [];
let failed = false;

// Report registry metadata only. Never mutate the manifest, lockfile, or vendored UI.
await Promise.all(
	Array.from({ length: 4 }, async () => {
		for (let entry = queue.shift(); entry; entry = queue.shift()) {
			const [name, declared] = entry;
			const locked =
				lock.packages[`node_modules/${name}`]?.version ?? "missing";
			try {
				const response = await fetch(
					`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
					{
						signal: AbortSignal.timeout(15_000),
					},
				);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const metadata = await response.json();
				if (typeof metadata.version !== "string")
					throw new Error("Missing version");
				results.push({
					name,
					declared,
					locked,
					latest: metadata.version,
					status: locked === metadata.version ? "current" : "review",
				});
			} catch (error) {
				failed = true;
				results.push({
					name,
					declared,
					locked,
					latest: "unknown",
					status: String(error),
				});
			}
		}
	}),
);

console.log(`Registry check: ${new Date().toISOString()}`);
console.table(results.sort((a, b) => a.name.localeCompare(b.name)));
console.log(
	"Registry versions don't show changes to shadcn source copied into src/lib/ui or to the vendored react-router skill. Review those separately.",
);
if (failed) process.exitCode = 1;
