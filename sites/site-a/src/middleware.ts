// The editorial auth guard lives in the CMS package; Astro resolves middleware
// from the site project, so this file only names the hook (see ADR-0016).
export { onRequest } from "cms/middleware";
