# Static Post Pre-Rendering with Dynamic Block Data

Articles are pre-rendered into 100% static HTML served by Cloudflare Static Assets, while blocks can resolve dynamic data through build-time data fetching (`loadServerData`) or runtime client hydration via zero-dependency Web Components (`clientScript`), without using Cloudflare R2.

## Status
Accepted

## Context
Publishing performance and SEO require that reader-facing blog posts require zero server-side computation at request time, leveraging Cloudflare's edge CDN cache. At the same time, editors require dynamic blocks — such as live polls, real-time stock/pricing tickers, and dynamic related content. Architectural constraints also prohibit the use of Cloudflare R2.

## Decision
1. **Static Post Output (SSG)**: All reader-facing routes (`/blog/[...slug].astro`) use `export const prerender = true` and `getStaticPaths()`. The entire page shell, prose, and initial block markup are compiled into static HTML (`dist/client/blog/.../index.html`).
2. **Pure Cloudflare Assets Media Storage**: Media assets are committed directly to `public/uploads/` on `main` via `GitHubMediaAdapter`, bundled into `./dist/uploads/` at build time, and deployed to Cloudflare Workers Static Assets (`assets = { directory = "./dist" }`). Zero R2 buckets or S3 drivers are used.
3. **Build-Time Dynamic Data**: Blocks requiring dynamic data that can be refreshed on deployment (e.g. `pricing-table`, `related-posts`) declare `loadServerData(props, ctx)`. The Document Renderer resolves these promises during `astro build` and bakes the data into static HTML and Schema.org JSON-LD.
4. **Runtime Dynamic Data via Web Components**: Blocks requiring real-time live data (e.g. `live-poll`) declare `clientScript` containing a custom element definition (e.g. `<site-live-poll>`). The Document Renderer aggregates block scripts and emits them inline into the static page. In the browser, the custom element queries dynamic edge API endpoints (`/api/*`, where `prerender = false`).

## Considered Options
- **Dynamic SSR for entire articles**: Rejected; incurs edge compute costs, introduces cold start latency, and degrades static caching.
- **Frontend framework client islands (React/Vue/Svelte)**: Rejected; requires loading heavy framework runtimes on static content pages. Vanilla Web Components provide full reactive DOM updates in < 2 KB with zero framework dependencies.
- **Cloudflare R2 for asset hosting**: Rejected by explicit architectural constraint.

## Consequences
- Every article is globally cached on Cloudflare's CDN edge with instant TTFB and zero compute overhead.
- Interactive blocks can fetch live data and handle user interactions seamlessly.
- Media assets are distributed globally via Cloudflare Assets with immutable caching headers.
