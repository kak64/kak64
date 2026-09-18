/** Absolute base URL of the public site, without a trailing slash. */
export function siteUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
