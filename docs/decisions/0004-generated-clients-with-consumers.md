# 0004: Keep generated clients near consumers initially

Status: accepted

Generate TypeScript and Swift transport clients from the backend's code-first OpenAPI export. Keep generated output near `web/` and `ios/` when those applications exist. Do not create `packages/` until a client has independent reuse or lifecycle pressure.
