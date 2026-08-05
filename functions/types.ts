/**
 * Shared type definitions for Cloudflare Pages Functions.
 *
 * Bindings are configured in wrangler.toml. Secrets are set as environment
 * variables in the Cloudflare Pages dashboard and appear here as plain
 * string properties.
 */

export interface Env {
  /** AES-GCM key material for session cookie encryption. */
  SESSION_SECRET: string;
}
