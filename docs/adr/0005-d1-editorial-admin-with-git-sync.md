# D1 Editorial Admin with Git-Sync Publisher

> Supersedes [ADR-0001](0001-git-mdx-content-with-cloudflare-static-assets.md) and [ADR-0004](0004-automated-editorial-branching-and-preview-prs.md)

To improve authoring DX/UX for both editors without sacrificing media co-location or build-time image optimization, content drafting and management are decoupled into an Astro-powered Web Admin Dashboard on Cloudflare Workers backed by D1. Editors authenticate via username/password, draft articles in a full-viewport CodeMirror workspace, and register co-located assets in D1; publishing serializes the article bundle and assets to GitHub via the GitHub REST API, triggering Cloudflare's static build pipeline.

## Considered Options

- **Pure D1 runtime with SSR**: Rejected because Cloudflare Workers cannot run Node C++ libraries like Sharp at runtime, and serving dynamic images from D1 BLOBs incurs high latency and database row constraints.
- **Local CLI Scaffolder (ADR-0004)**: Superseded due to friction and lack of visual management (table of posts, duplicate, delete, CodeMirror editor with formatting toolbar).
- **Third-Party Headless CMS (Sanity / Tina / Decap)**: Rejected to keep all editorial operations, database records, and authentication natively hosted within Cloudflare Workers and D1 without external service costs.
