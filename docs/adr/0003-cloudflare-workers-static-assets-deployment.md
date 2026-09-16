# Cloudflare Workers Pure Static Assets Deployment

The blog is deployed directly to Cloudflare Workers using Wrangler Static Assets (`assets = { directory = "./dist" }`) without an SSR server adapter. Because all MDX articles, components, and media are pre-rendered into static HTML, CSS, and optimized images at build time, the application requires zero edge compute runtime overhead and leverages Cloudflare's global edge cache for instantaneous asset delivery.

## Considered Options

- **`@astrojs/cloudflare` in SSR / Hybrid mode**: Deferred until dynamic edge API routes or D1 database interactions are actively required, avoiding unnecessary runtime bundle size and worker cold starts.
