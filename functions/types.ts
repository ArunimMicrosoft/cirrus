/**
 * Shared type definitions for Cloudflare Pages Functions.
 *
 * Bindings are configured in wrangler.toml. Secrets are set as environment
 * variables in the Cloudflare Pages dashboard and appear here as plain
 * string properties.
 */

export interface Env {
  /** AES-GCM key material for session cookie encryption. Required. */
  SESSION_SECRET: string;

  /**
   * Multi-tenant Azure AD application (client) ID that owns the device code
   * flow. Only required when users sign in with the "Sign in with my account"
   * option. The deployer creates this app registration once and configures:
   *   - Multi-tenant (Accounts in any organizational directory)
   *   - Allow public client flows: YES
   *   - Delegated permissions: Azure Service Management / user_impersonation
   */
  AZURE_AD_CLIENT_ID?: string;

  /**
   * Session generation. Any string; defaults to "1" when unset. Bump this
   * value in the Cloudflare Pages env var UI to immediately sign out every
   * user — the next request they make will fail the epoch check and force a
   * re-login. Preferred over rotating SESSION_SECRET, which is a heavier
   * cryptographic operation.
   */
  SESSION_EPOCH?: string;
}
