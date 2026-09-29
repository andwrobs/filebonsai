import {
	type ChildProcess,
	execFile,
	execFileSync,
	spawn,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	chmodSync,
	createWriteStream,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// The disposable environment behind one e2e run: a PostgreSQL container, the
// PostgreSQL-profile backend built from this checkout with a generated owner
// password, and the production web build served by `vite preview`, which
// proxies /api to that backend. Nothing here reuses a developer's database,
// backend, or settings, and everything it starts is stopped by `stop()`.

const run = promisify(execFile);

const webRoot = path.resolve(import.meta.dirname, "..");
const backendRoot = path.resolve(webRoot, "../backend");
export const outputRoot = path.join(import.meta.dirname, ".output");
const logRoot = path.join(outputRoot, "logs");

const postgresImage = "postgres:17.6-alpine";

export type Stack = {
	/** Origin of the served web client. */
	baseUrl: string;
	/** File holding this run's generated owner password. */
	ownerPasswordFile: string;
	stop(): Promise<void>;
};

type Cleanup = { async: () => Promise<void>; sync: () => void };

const signals = { SIGHUP: 1, SIGTERM: 15 } as const;

export async function startStack(): Promise<Stack> {
	mkdirSync(logRoot, { recursive: true });
	const cleanups: Cleanup[] = [];
	// Each cleanup runs once, whichever path reaches it first. The synchronous
	// path covers an exit, a signal, or a second Ctrl-C during an async stop.
	const done = new Set<Cleanup>();
	const stopSync = () => {
		for (const cleanup of [...cleanups].reverse()) {
			if (done.has(cleanup)) continue;
			done.add(cleanup);
			try {
				cleanup.sync();
			} catch {
				// Best effort while the runner exits.
			}
		}
	};
	const onSignal = (signal: NodeJS.Signals) => {
		stopSync();
		process.exit(128 + signals[signal as keyof typeof signals]);
	};
	process.once("exit", stopSync);
	for (const signal of Object.keys(signals)) process.once(signal, onSignal);
	const stop = async () => {
		for (const cleanup of [...cleanups].reverse()) {
			if (done.has(cleanup)) continue;
			await cleanup.async();
			done.add(cleanup);
		}
		process.off("exit", stopSync);
		for (const signal of Object.keys(signals)) process.off(signal, onSignal);
	};

	try {
		// Secrets live in a private temporary directory, never in the repository,
		// command arguments, or logs.
		const secrets = mkdtempSync(path.join(tmpdir(), "filebonsai-e2e-"));
		chmodSync(secrets, 0o700);
		cleanups.push({
			async: async () => rmSync(secrets, { recursive: true, force: true }),
			sync: () => rmSync(secrets, { recursive: true, force: true }),
		});
		const ownerPasswordFile = path.join(secrets, "owner-password");
		writeFileSync(ownerPasswordFile, randomBytes(24).toString("base64url"), {
			mode: 0o600,
		});
		const databasePassword = randomBytes(24).toString("base64url");

		const database = await startPostgres(databasePassword, cleanups);
		const jar = await backendJar();
		const apiUrl = await startBackend({
			jar,
			database,
			databasePassword,
			ownerPasswordFile,
			storageRoot: path.join(secrets, "storage"),
			cleanups,
		});
		const baseUrl = await startWeb(apiUrl, cleanups);
		return { baseUrl, ownerPasswordFile, stop };
	} catch (error) {
		await stop();
		throw error;
	}
}

async function startPostgres(password: string, cleanups: Cleanup[]) {
	try {
		await run("docker", ["version", "--format", "{{.Server.Version}}"]);
	} catch {
		throw new Error(
			"e2e: Docker is not reachable. Start Docker, then run `npm run e2e` again.",
		);
	}
	// The run's label finds its container even when an interruption lands
	// between `docker run` and reading the container ID.
	const label = `filebonsai.e2e=${randomBytes(8).toString("hex")}`;
	const containers = () =>
		execFileSync(
			"docker",
			["ps", "--all", "--quiet", "--filter", `label=${label}`],
			{
				encoding: "utf8",
			},
		)
			.split("\n")
			.filter(Boolean);
	cleanups.push({
		async: async () => {
			for (const id of containers()) {
				// Keep the server log beside the others; it names SQL errors that
				// the API reports only as a status.
				await run("docker", ["logs", id], { maxBuffer: 16 * 1024 * 1024 })
					.then(({ stdout, stderr }) =>
						writeFileSync(path.join(logRoot, "postgres.log"), stdout + stderr),
					)
					.catch(() => {});
				await run("docker", ["rm", "--force", id]).catch(() => {});
			}
		},
		sync: () => {
			const ids = containers();
			if (ids.length) {
				execFileSync("docker", ["rm", "--force", ...ids], { stdio: "ignore" });
			}
		},
	});
	// -e POSTGRES_PASSWORD without a value reads it from this process's
	// environment, so the password never appears in the process list.
	const { stdout } = await run(
		"docker",
		[
			"run",
			"--detach",
			"--rm",
			"--label",
			label,
			"--tmpfs",
			"/var/lib/postgresql/data",
			"--publish",
			"127.0.0.1::5432",
			"--env",
			"POSTGRES_DB=filebonsai",
			"--env",
			"POSTGRES_USER=filebonsai",
			"--env",
			"POSTGRES_PASSWORD",
			postgresImage,
		],
		{ env: { ...process.env, POSTGRES_PASSWORD: password } },
	);
	const container = stdout.trim();
	const { stdout: mapping } = await run("docker", [
		"port",
		container,
		"5432/tcp",
	]);
	const port = Number(mapping.trim().split("\n")[0]?.split(":").at(-1));
	// Probe over TCP: the image's initialization server listens only on a
	// socket, so a socket probe can succeed before the real server starts.
	await waitFor(`PostgreSQL (${postgresImage})`, 60_000, async () => {
		await run("docker", [
			"exec",
			container,
			"pg_isready",
			"--host=127.0.0.1",
			"--username=filebonsai",
			"--dbname=filebonsai",
		]);
	});
	console.log(`e2e: ${postgresImage} on 127.0.0.1:${port}`);
	return { port };
}

// Reuses backend/target's jar unless a main source or the POM is newer.
async function backendJar() {
	const target = path.join(backendRoot, "target");
	const existing = findJar(target);
	const newestSource = Math.max(
		statSync(path.join(backendRoot, "pom.xml")).mtimeMs,
		newestMtime(path.join(backendRoot, "src/main")),
	);
	if (existing && statSync(existing).mtimeMs >= newestSource) return existing;
	console.log("e2e: building the backend jar (./mvnw package)");
	await logged(
		"backend-build",
		path.join(backendRoot, "mvnw"),
		["--quiet", "-DskipTests", "package"],
		{ cwd: backendRoot },
	);
	const built = findJar(target);
	if (!built) throw new Error("e2e: ./mvnw package produced no jar");
	return built;
}

async function startBackend(options: {
	jar: string;
	database: { port: number };
	databasePassword: string;
	ownerPasswordFile: string;
	storageRoot: string;
	cleanups: Cleanup[];
}) {
	const port = await freePort();
	const java = process.env.JAVA_HOME
		? path.join(process.env.JAVA_HOME, "bin/java")
		: "java";
	// Start from a clean slate: a developer's shell may export Spring,
	// Filebonsai (R2, storage), or JVM option settings that must not reach
	// this backend.
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) =>
				!/^(SPRING_|FILEBONSAI_|JAVA_TOOL_OPTIONS$|JDK_JAVA_OPTIONS$)/.test(
					name,
				),
		),
	);
	const backend = startProcess(
		"backend",
		java,
		[
			"-jar",
			options.jar,
			"--spring.profiles.active=postgres",
			"--server.address=127.0.0.1",
			`--server.port=${port}`,
		],
		{
			cwd: path.dirname(options.storageRoot),
			env: {
				...env,
				SPRING_DATASOURCE_URL: `jdbc:postgresql://127.0.0.1:${options.database.port}/filebonsai`,
				SPRING_DATASOURCE_USERNAME: "filebonsai",
				SPRING_DATASOURCE_PASSWORD: options.databasePassword,
				FILEBONSAI_CATALOG_CURSOR_SECRET_BASE64:
					randomBytes(32).toString("base64"),
				FILEBONSAI_ACCESS_COOKIE_SECURE: "false",
				FILEBONSAI_ACCESS_BOOTSTRAP_PASSWORD_FILE: options.ownerPasswordFile,
				FILEBONSAI_STORAGE_PROVIDER: "local",
				FILEBONSAI_STORAGE_ROOT: options.storageRoot,
				FILEBONSAI_STORAGE_DISPLAY_NAME: "Synthetic e2e disk",
			},
		},
		options.cleanups,
	);
	const url = `http://127.0.0.1:${port}`;
	await waitFor("the backend", 120_000, async () => {
		backend.assertRunning();
		await expectOk(`${url}/api/v1/auth/csrf`);
	});
	console.log(`e2e: backend on ${url} (log: ${relative(backend.log)})`);
	return url;
}

async function startWeb(apiUrl: string, cleanups: Cleanup[]) {
	const bin = path.join(webRoot, "node_modules/.bin");
	await logged("web-build", path.join(bin, "react-router"), ["build"], {
		cwd: webRoot,
	});
	const port = await freePort();
	const web = startProcess(
		"web",
		path.join(bin, "vite"),
		[
			"preview",
			"--outDir",
			"build/client",
			"--host",
			"127.0.0.1",
			"--port",
			String(port),
			"--strictPort",
		],
		{
			cwd: webRoot,
			env: { ...process.env, FILEBONSAI_API_PROXY_TARGET: apiUrl },
		},
		cleanups,
	);
	const url = `http://127.0.0.1:${port}`;
	await waitFor("the web client", 30_000, async () => {
		web.assertRunning();
		await expectOk(url);
		await expectOk(`${url}/api/v1/auth/csrf`);
	});
	console.log(`e2e: web client on ${url} (log: ${relative(web.log)})`);
	return url;
}

// A long-running child whose output goes to .output/logs, not the terminal.
function startProcess(
	name: string,
	command: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
	cleanups: Cleanup[],
) {
	const log = path.join(logRoot, `${name}.log`);
	const out = createWriteStream(log);
	const child = spawn(command, args, { ...options, stdio: "pipe" });
	child.stdout.pipe(out);
	child.stderr.pipe(out);
	let exited: string | undefined;
	child.once("exit", (code, signal) => {
		exited = `exited with ${signal ?? code}`;
	});
	child.once("error", (error) => {
		exited = `failed to start: ${error.message}`;
	});
	cleanups.push({
		async: () => terminate(child),
		sync: () => {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL");
			}
		},
	});
	return {
		log,
		assertRunning() {
			if (exited) {
				throw new Fatal(`e2e: ${name} ${exited}.\n${tail(log)}`);
			}
		},
	};
}

async function terminate(child: ChildProcess) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise((resolve) => child.once("exit", resolve));
	child.kill("SIGTERM");
	const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
	await exited;
	clearTimeout(timer);
}

// A short command whose output is kept in a log and shown only on failure.
async function logged(
	name: string,
	command: string,
	args: string[],
	options: { cwd: string },
) {
	const log = path.join(logRoot, `${name}.log`);
	try {
		const { stdout, stderr } = await run(command, args, {
			...options,
			maxBuffer: 64 * 1024 * 1024,
		});
		writeFileSync(log, stdout + stderr);
	} catch (error) {
		const { stdout = "", stderr = "" } = error as {
			stdout?: string;
			stderr?: string;
		};
		writeFileSync(log, stdout + stderr);
		throw new Error(`e2e: ${name} failed.\n${tail(log)}`);
	}
}

class Fatal extends Error {}

async function waitFor(
	what: string,
	timeoutMs: number,
	probe: () => Promise<void>,
) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			return await probe();
		} catch (error) {
			if (error instanceof Fatal) throw error;
			if (Date.now() > deadline) {
				throw new Error(`e2e: ${what} was not ready within ${timeoutMs} ms`, {
					cause: error,
				});
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

async function expectOk(url: string) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
}

function freePort() {
	return new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

// The newest boot jar, if several versions are in target/.
function findJar(target: string) {
	try {
		return readdirSync(target)
			.filter((name) => /^filebonsai-catalog-.+\.jar$/.test(name))
			.map((name) => path.join(target, name))
			.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
	} catch {
		return undefined;
	}
}

function newestMtime(root: string): number {
	let newest = 0;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name);
		newest = Math.max(
			newest,
			entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs,
		);
	}
	return newest;
}

// The last lines of a log, for a bounded failure message.
function tail(log: string, lines = 30) {
	let text = "";
	try {
		text = readFileSync(log, "utf8");
	} catch {
		return `(no log at ${relative(log)})`;
	}
	const last = text.trimEnd().split("\n").slice(-lines).join("\n");
	return `--- last ${lines} lines of ${relative(log)} ---\n${last}`;
}

function relative(file: string) {
	return path.relative(process.cwd(), file);
}
