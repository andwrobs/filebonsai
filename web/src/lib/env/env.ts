import { parseEnv } from "./schema";

// vite.config.ts already rejected bad values at dev and build time.
export const env = parseEnv(import.meta.env);
