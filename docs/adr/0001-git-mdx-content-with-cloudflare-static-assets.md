# Git-Based MDX Content Model with Cloudflare Static Assets

To support two co-editors authoring rich articles with custom interactive components, breakout layout styling, and structured JSON-LD data without incurring R2 or Cloudflare Images storage costs, articles and media are stored directly in Git as MDX and co-located static assets. The site builds statically and deploys directly to Cloudflare Workers using Cloudflare Static Assets, utilizing branch previews for editorial review.

## Considered Options

- **Headless CMS / Decap / Sveltia**: Rejected because GUI CMS interfaces restrict arbitrary MDX component nesting, prop passing (e.g. `stretch`), and custom component-level JSON-LD schema extraction.
- **Cloudflare D1 dynamic CMS**: Rejected due to the operational complexity of building an in-house auth/editor system and parsing MDX dynamically at runtime on Workers.
- **Cloudflare R2 / Cloudflare Images**: Explicitly rejected by architectural constraint in favor of co-located Git assets deployed via Cloudflare Static Assets.
