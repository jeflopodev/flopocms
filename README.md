# FlopoCMS

A modern, decoupled, Git-backed Headless CMS engine and administrative service built on Astro SSR and Cloudflare Workers (D1), featuring pluggable JSX Block DSL (`@jeflopodev/blocks`), bare-text prose authoring, Live Draft Previews, and atomic Git Data API publishing.

---

## 📦 Packages & Services

| Package / Surface | Description |
| :--- | :--- |
| **`@jeflopodev/cms`** | Autonomous Headless CMS admin service (SSR): Admin dashboard, CodeMirror editor, D1 editorial records, sessions, setup wizard, and Live Draft Preview. |
| **`@jeflopodev/blocks`** | Pluggable JSX Block DSL parser, serializer, AST inspector, Schema.org JSON-LD synthesizer, and standard blocks (`<Callout>`, `<Youtube>`, `<PricingTable>`, etc.). |

---

## ⚡ Architecture & Highlights

1. **Standalone Headless CMS Service**: Runs independently on Cloudflare Workers SSR with its own D1 database for sessions, locks, and draft projections. Does not pollute consumer websites with admin routes or write secrets.
2. **First-Run Web Setup Wizard (`/admin/setup`)**: When deployed to a fresh D1 database, the CMS automatically guides you to create the initial administrator credentials directly in the browser—no cumbersome CLI scripts needed.
3. **Atomic Git Data API Publishing**: When an article is published or modified, FlopoCMS commits Post Bundles (`index.mdx` + WebP/AVIF images) atomically to the consumer repository's `main` branch via GitHub REST API.
4. **Live Draft Preview (`/admin/posts/[id]/preview`)**: Previews draft posts reading live from D1 editorial records, rendered through `@jeflopodev/blocks` with full template and bleed layout fidelity before committing to Git.
5. **Bare-Text Prose Authoring (ADR-0019)**: Zero markdown in CodeMirror editor or disk storage. Plain paragraphs are authored naturally without `<Paragraph>` tags; deterministic AST handles parsing and validation.
6. **Pure Cloudflare Assets (Zero Cloudflare R2)**: Co-located post assets and uploads live in Git and deploy directly to Cloudflare edge assets.

---

## 🚀 Running FlopoCMS Locally

### Prerequisites

- Node.js >= 22.12.0
- pnpm >= 12.0.0

```bash
# Install dependencies
pnpm install

# Run all test suites
pnpm test

# Run local CMS dev server (with local D1 platform proxy)
pnpm dev

# Build CMS server bundle
pnpm build
```

---

## 🧪 Testing

```bash
pnpm test
```

---

## 📄 License

MIT © 2026 jeflopodev
