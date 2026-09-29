import { startStack } from "./stack";

// Starts the disposable stack once per run and hands its origin and owner
// password file to the workers; the returned function is the global teardown.
export default async function globalSetup() {
	const stack = await startStack();
	process.env.FILEBONSAI_E2E_BASE_URL = stack.baseUrl;
	process.env.FILEBONSAI_E2E_OWNER_PASSWORD_FILE = stack.ownerPasswordFile;
	return () => stack.stop();
}
