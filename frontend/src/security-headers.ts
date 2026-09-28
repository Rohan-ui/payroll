/**
 * Security response headers shared by both front ends.
 *
 * These are applied by the dev servers so local development matches
 * production, and the same values belong in the reverse proxy or CDN that
 * serves the built assets. See PLATFORM_PORTAL.md for an nginx example.
 */

/**
 * Content-Security-Policy.
 *
 * `script-src 'self'` is the control that matters: it means injected markup
 * cannot execute, which is the difference between a stored-HTML bug being an
 * annoyance and being an account takeover. The production bundles contain no
 * inline scripts, so this holds without nonces.
 *
 * `style-src` keeps 'unsafe-inline' because component libraries inject style
 * elements at runtime. Injected CSS cannot run code, so this is a deliberate
 * and much smaller concession than loosening script-src.
 */
export function buildContentSecurityPolicy(options: { allowViteDevServer: boolean }): string {
  const scriptSrc = options.allowViteDevServer
    ? // The dev server evaluates modules and injects the HMR client.
      "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self'";

  const connectSrc = options.allowViteDevServer
    ? // HMR uses a websocket back to the dev server.
      "'self' ws: wss:"
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc}`,
    // Plugins and embedded documents are never needed and are a classic
    // execution vector, so they are refused outright.
    "object-src 'none'",
    "frame-src 'none'",
    // Stops an injected <base> tag redirecting every relative URL.
    "base-uri 'self'",
    // Stops an injected form posting credentials to an attacker.
    "form-action 'self'",
    // Clickjacking: nothing may frame these applications.
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function buildSecurityHeaders(options: { allowViteDevServer: boolean }): Record<string, string> {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    // Legacy equivalent of frame-ancestors for older browsers.
    'X-Frame-Options': 'DENY',
    // Stops the browser guessing a type and running a response as script.
    'X-Content-Type-Options': 'nosniff',
    // Keeps full URLs, which can carry record identifiers, off other origins.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Features this product never uses.
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}
