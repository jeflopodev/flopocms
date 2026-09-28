# Standalone Site Template & Autonomous Deployment Pipeline

This guide documents the repository layout and CI/CD deployment pipeline for creating autonomous site repositories powered by the decoupled Headless CMS.

---

## 1. Standalone Site Repository Layout

Each site exists in its own independent Git repository (e.g. `github.com/my-org/site-alpha`):

```
site-alpha/
├── .github/
│   └── workflows/
│       └── deploy.yml              # Autonomous GitHub Actions CI/CD
├── src/
│   ├── blocks/                     # Site-specific custom blocks
│   │   ├── pricing-table/
│   │   ├── live-poll/
│   │   └── index.ts
│   ├── content/
│   │   └── blog/                   # Site-owned published Post Bundles
│   │       └── hello-world/
│   │           └── index.mdx
│   ├── layouts/
│   │   └── root-layout.astro       # Site chrome, navigation, headers, footers
│   ├── pages/
│   │   ├── api/                    # Dynamic edge API routes (prerender = false)
│   │   ├── blog/
│   │   │   └── [...slug].astro     # 100% Static Post SSG route
│   │   └── index.astro
│   ├── content.config.ts           # Site content collection definition
│   └── middleware.ts               # Delegates to cms/middleware
├── public/
│   └── uploads/                    # Media assets (deployed to Cloudflare Assets)
├── astro.config.mjs                # Astro configuration + cmsAdmin(siteConfig)
├── cms.config.ts                   # Declarative site CMS configuration
├── package.json                    # Depends on @org/cms, @org/blocks, etc.
└── wrangler.jsonc                  # Site-specific D1 database & Cloudflare Workers config
```

---

## 2. Declarative Site Configuration (`cms.config.ts`)

```typescript
import { defineConfig } from "cms/config";
import { customSiteBlocks } from "./src/blocks";

export default defineConfig({
  siteName: "Site Alpha",
  contentDir: "src/content/blog",
  uploadsDir: "public/uploads",
  authors: [
    { id: "alice", name: "Alice Editorial", avatar: "/uploads/alice.webp" },
    { id: "bob", name: "Bob Writer", avatar: "/uploads/bob.webp" },
  ],
  blocks: customSiteBlocks,
  templates: [
    { id: "default", label: "Default Single Column" },
    { id: "two-column", label: "Two Columns with Aside" },
  ],
  settings: {
    defaults: {
      siteTitle: "Site Alpha Publication",
      siteDescription: "Independent publication on Astro and Cloudflare",
    },
  },
});
```

---

## 3. Autonomous CI/CD Pipeline (`.github/workflows/deploy.yml`)

Each site repository runs its own deployment pipeline upon commits to `main`:

```yaml
name: Deploy Site to Cloudflare

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: deploy-site-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Site Repository
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 12.4.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify Image Sizes Guardrail
        run: pnpm check:images

      - name: Apply D1 Database Migrations
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: pnpm d1:migrate --remote

      - name: Build Static Output (Astro SSG)
        env:
          ASTRO_DATABASE_FILE: ".astro/content.db"
        run: pnpm build

      - name: Project Published View into D1
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: pnpm review:project

      - name: Deploy to Cloudflare Workers with Static Assets
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

---

## 4. Pure Cloudflare Assets Delivery (Zero Cloudflare R2)

1. **Uploads**: Editors upload images in the Admin dashboard. The CMS commits them directly to `public/uploads/<filename>` in the site's GitHub repository on `main` (`[skip ci]`).
2. **Build**: `pnpm build` copies `public/uploads/` directly into `./dist/uploads/`.
3. **Edge Distribution**: Wrangler deploys `./dist` to Cloudflare Workers Static Assets (`assets = { directory = "./dist" }`).
4. **Caching**: Assets are served from Cloudflare's global edge cache with `Cache-Control: public, max-age=31536000, immutable`. Zero Cloudflare R2 buckets or compute costs are incurred.

---

## 5. Upgrading the CMS Engine

Upgrading the CMS engine in an autonomous site is an isolated version bump:

```bash
# In the site repository
pnpm update @org/cms
pnpm d1:migrate
pnpm build
```

Because all CMS interfaces (`BlockDefinition`, `CmsConfig`, `cmsAdmin()`) sit behind stable contracts, the site's custom blocks, themes, settings, and content bundles remain completely unaffected.
