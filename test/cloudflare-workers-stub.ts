/**
 * Local substitute for the `cloudflare:workers` virtual module.
 *
 * Application modules read runtime bindings through `getRuntimeEnv`, which checks this
 * module first. In tests it stays empty, so resolution falls through to the values a
 * test injects (or to process.env). Never imported by application code.
 */
export const env: Record<string, unknown> = {};
