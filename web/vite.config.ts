import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// The backend binds 127.0.0.1; "localhost" can resolve to ::1 first and miss it.
const apiTarget = process.env.FILEBONSAI_API_PROXY_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [reactRouter()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/oauth2": apiTarget,
      "/login/oauth2": apiTarget,
    },
  },
});
