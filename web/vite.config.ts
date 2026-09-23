import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  server: {
    proxy: {
      "/api": process.env.FILEBONSAI_API_PROXY_TARGET ?? "http://localhost:8080",
      "/oauth2": process.env.FILEBONSAI_API_PROXY_TARGET ?? "http://localhost:8080",
      "/login/oauth2": process.env.FILEBONSAI_API_PROXY_TARGET ?? "http://localhost:8080",
    },
  },
});
