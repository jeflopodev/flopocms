# Multi-Repository Extraction (Repo Split) Execution Guide

This operational guide details the verified steps executed to decouple the monorepo into separate, independent Git repositories with full commit history preserved.

---

## 1. Live Repositories

| Repository | GitHub URL | Purpose | Monorepo Origin |
| :--- | :--- | :--- | :--- |
| **`flopocms`** | [github.com/jeflopodev/flopocms](https://github.com/jeflopodev/flopocms) | Core CMS engine: Admin dashboard, JSX Block DSL, standard blocks, D1 migrations, and automated package publishing. | `packages/cms/` + `packages/blocks/` |
| **`larutamotera`** | [github.com/jeflopodev/larutamotera](https://github.com/jeflopodev/larutamotera) | Autonomous production publication: site content, custom blocks (`PricingTable`, `LivePoll`), theme, declarative settings (`cms.config.ts`), and turnkey Cloudflare deployment pipeline. | `sites/site-a/` |

---

## 2. FlopoCMS Engine Extraction (`flopocms`)

### 2.1 Git Isolation
```bash
# 1. Clone monorepo into dedicated engine folder
git clone --no-local blog flopocms
cd flopocms

# 2. Set remote origin
git remote set-url origin https://github.com/jeflopodev/flopocms.git

# 3. Strip consumer site directory
git rm -r sites/
git commit -m "chore: isolate flopocms engine repository"

# 4. Tag release
git tag -a v0.1.3 -m "Release v0.1.3"
git push -u origin main --tags --force
```

### 2.2 Export Maps & Bundler Compatibility
In modern Vite / Rolldown / TypeScript setups, package subpaths must be explicitly declared in `package.json` `exports`:

**`packages/blocks/package.json`**:
```json
{
  "name": "@jeflopodev/blocks",
  "version": "0.1.3",
  "exports": {
    "./package.json": "./package.json",
    "./dsl": "./src/dsl/index.ts",
    "./dsl/parser": "./src/dsl/parser.ts",
    "./dsl/renderer": "./src/dsl/renderer.ts",
    "./*": "./src/*.ts"
  }
}
```

**`packages/cms/package.json`**:
```json
{
  "name": "@jeflopodev/cms",
  "version": "0.1.3",
  "exports": {
    "./package.json": "./package.json",
    "./*.astro": "./src/*.astro",
    "./*.css": "./src/*.css",
    "./assets/*": "./src/assets/*",
    "./*": "./src/*.ts"
  }
}
```

### 2.3 Astro Route Injection Resilience
Inside `packages/cms/src/integration.ts`, route entrypoints must use `fileURLToPath(new URL(relPath, import.meta.url))` so Astro's `injectRoute` receives absolute paths across package boundaries without assuming relative site folder layouts:

```typescript
const resolveRoute = (relPath: string) => fileURLToPath(new URL(relPath, import.meta.url));

const routes: Array<{ pattern: string; entrypoint: string }> = [
  { pattern: "/admin", entrypoint: resolveRoute("./routes/admin/index.astro") },
  { pattern: "/admin/posts", entrypoint: resolveRoute("./routes/admin/posts/index.astro") },
  ...
];
```

---

## 3. Site Extraction (`larutamotera`)

### 3.1 Git Subtree Split (Preserving 100% Commit History)
```bash
# 1. In monorepo root, create isolated subtree branch for site-a
git subtree split --prefix=sites/site-a -b larutamotera-split

# 2. Clone branch into autonomous directory
git clone -b larutamotera-split blog larutamotera
cd larutamotera

# 3. Rename branch to main & set remote
git branch -M main
git remote set-url origin https://github.com/jeflopodev/larutamotera.git
```

### 3.2 Dependency Consumption in Consumer Sites

#### Option A: Direct Git Dependencies (Configured & Live)
In `package.json`:
```json
{
  "dependencies": {
    "cms": "github:jeflopodev/flopocms#path:packages/cms",
    "blocks": "github:jeflopodev/flopocms#path:packages/blocks"
  }
}
```

To permit pnpm to resolve exotic git dependencies and run required native build scripts (`esbuild`, `sharp`, `workerd`), configure `pnpm-workspace.yaml`:
```yaml
blockExoticSubdeps: false

allowBuilds:
  esbuild: true
  sharp: true
  workerd: true
```

#### Option B: GitHub Packages (`npm.pkg.github.com`)
When tags like `v0.1.3` are pushed to `flopocms`, GitHub Actions automatically publishes packages to GitHub Packages.

To consume via GitHub Packages instead of Git URLs:
1. In `.npmrc`:
   ```ini
   @jeflopodev:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```
2. In `package.json`:
   ```json
   {
     "dependencies": {
       "cms": "npm:@jeflopodev/cms@^0.1.3",
       "blocks": "npm:@jeflopodev/blocks@^0.1.3"
     }
   }
   ```

---

## 4. Autonomous Site Configuration Verification

In `larutamotera`:
1. **`cms.config.ts`**:
   ```typescript
   import { defineConfig } from "cms/config";
   import { customSiteBlocks } from "./src/blocks";

   export default defineConfig({
     siteName: "La Ruta Motera",
     contentDir: "src/content/blog",
     uploadsDir: "public/uploads",
     authors: [{ id: "jeflopo", name: "Jef Lopo" }],
     blocks: customSiteBlocks,
   });
   ```

2. **`wrangler.jsonc`**:
   ```jsonc
   {
     "name": "larutamotera",
     "compatibility_date": "2026-09-16",
     "compatibility_flags": ["nodejs_compat"],
     "assets": { "directory": "./dist" },
     "vars": {
       "CONTENT_DIR": "src/content/blog",
       "UPLOADS_DIR": "public/uploads"
     },
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "larutamotera-db",
         "database_id": "<d1-database-uuid>",
         "migrations_dir": "node_modules/cms/migrations"
       }
     ]
   }
   ```

3. **Autonomous Verification**:
   ```bash
   pnpm install
   pnpm typecheck   # 0 errors
   pnpm build       # Emits static HTML in ./dist/
   ```

---

## 5. Turnkey CI/CD Deployment (`.github/workflows/deploy.yml`)

`larutamotera` includes an automated GitHub Actions deployment workflow:
1. **`pnpm run typecheck`**: Verifies all site TypeScript.
2. **`pnpm run build`**: Runs `cms-check-images` and `astro build` (pre-rendering 100% static HTML and bundling `./public/uploads` into `./dist/uploads`).
3. **`wrangler d1 migrations apply DB --remote`**: Applies database migrations from `node_modules/cms/migrations`.
4. **`pnpm run review:project`**: Synchronizes published articles with the site's D1 read model.
5. **`wrangler deploy`**: Publishes `./dist` to Cloudflare Workers with Cloudflare Assets.

### Required GitHub Repository Secrets
Navigate to **GitHub Repository > Settings > Secrets and variables > Actions**:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
