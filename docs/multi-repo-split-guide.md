# Multi-Repository Extraction (Repo Split) Execution Guide

This operational guide details the exact steps to mechanically split the current monorepo into separate, independent Git repositories with full commit history preserved.

---

## 1. Target Repositories

| Repository | Purpose | Source in Monorepo |
| :--- | :--- | :--- |
| **`headless-cms`** | Core CMS engine, admin dashboard, JSX Block DSL, standard blocks, and D1 migrations. Published as `@org/cms` & `@org/blocks` (or consumed via git tag). | `packages/cms/` + `packages/blocks/` |
| **`site-a`** | Independent production publication: content, custom blocks, themes, config, and deployment pipeline. | `sites/site-a/` |
| **`blog-site-template`** | Starter repository for scaffolding brand-new publication sites. | Based on `sites/site-a/` |

---

## 2. Step 1: Packaging & Publishing `@org/blocks` and `@org/cms`

The packages already have `files` manifests and binary scripts configured.

### In `packages/blocks/`:
```bash
# Update version in package.json
pnpm --filter blocks publish --access public
```

### In `packages/cms/`:
```bash
# Update version in package.json (depends on published blocks version)
pnpm --filter cms publish --access public
```

### Alternative Distribution Methods for Private / In-House Use

If you do not want to publish your CMS packages publicly to `npmjs.com`, you have three robust alternatives:

#### Alternative A: GitHub Packages (`npm.pkg.github.com`)
GitHub Packages allows you to host private npm packages directly inside your GitHub organization or personal account, utilizing your existing GitHub access controls.

1. **Configure Package Name & Publish Registry**:
   GitHub Packages requires the package name to be scoped to your GitHub username or organization:
   ```json
   // in packages/cms/package.json
   {
     "name": "@my-org/cms",
     "version": "0.1.0",
     "publishConfig": {
       "registry": "https://npm.pkg.github.com"
     }
   }
   ```
2. **Configure Authentication (`.npmrc`)**:
   Create a `.npmrc` file in the project root (and in consumer site repos):
   ```ini
   @my-org:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```
3. **Publishing**:
   Generate a GitHub Personal Access Token (classic) with `write:packages` and `read:packages` scopes (or use the built-in `GITHUB_TOKEN` inside GitHub Actions):
   ```bash
   export GITHUB_TOKEN="ghp_yourPersonalAccessTokenHere"
   pnpm publish
   ```
4. **Installing in Consumer Sites**:
   In any site repository with the same `.npmrc`:
   ```bash
   pnpm add @my-org/cms
   ```
   In CI (`.github/workflows/deploy.yml`), pass `secrets.GITHUB_TOKEN` to the install step:
   ```yaml
   - name: Install Dependencies
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     run: pnpm install --frozen-lockfile
   ```

---

#### Alternative B: Direct Git Dependencies (`github:my-org/...#v0.1.0`)
Zero registry infrastructure required. You can install npm packages directly from a GitHub repository using Git tags or branch names.

1. **Tagging a Release**:
   Whenever you want to release a new version in your CMS repository:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
2. **Referencing in Consumer Sites (`package.json`)**:
   In your site's `package.json`, point directly to the Git repository and the tag:
   ```json
   {
     "dependencies": {
       "cms": "github:my-org/headless-cms#v0.1.0",
       "blocks": "github:my-org/blocks#v0.1.0"
     }
   }
   ```
   *Note for Monorepos*: If `cms` and `blocks` remain in subfolders within a single repository, use Git URL subdirectory syntax:
   ```json
   {
     "dependencies": {
       "cms": "git+https://github.com/my-org/headless-cms.git#v0.1.0&subdirectory=packages/cms",
       "blocks": "git+https://github.com/my-org/headless-cms.git#v0.1.0&subdirectory=packages/blocks"
     }
   }
   ```
3. **Private Repository Authentication in CI**:
   If the repository is private, grant the site repository read access in GitHub Actions by using a Deploy Key or a Personal Access Token:
   ```yaml
   - name: Setup SSH Deploy Key (for private Git dependencies)
     uses: webfactory/ssh-agent@v0.9.0
     with:
       ssh-private-key: ${{ secrets.CMS_REPO_DEPLOY_KEY }}
   ```

*Pros*: Instant setup, zero cost, no package registry or tokens needed for public repos.  
*Cons*: Slightly slower `pnpm install` in CI (clones Git repo rather than downloading a cached tarball); subfolder syntax can be verbose.

---

#### Alternative C: Git Submodules (`git submodule add`)
Embeds the CMS repository directly into a subfolder of your site repository at an exact commit.

1. **Adding the Submodule**:
   Inside your site repository:
   ```bash
   git submodule add git@github.com:my-org/headless-cms.git vendor/cms
   ```
2. **Linking via `pnpm-workspace.yaml` or Local File Path**:
   You can treat the submodule as a local package:
   ```json
   // in site package.json
   {
     "dependencies": {
       "cms": "file:./vendor/cms/packages/cms",
       "blocks": "file:./vendor/cms/packages/blocks"
     }
   }
   ```
3. **Cloning and CI Requirements**:
   When cloning or running CI, you must fetch submodules recursively:
   ```bash
   git clone --recurse-submodules git@github.com:my-org/site-a.git
   # Or in GitHub Actions checkout step:
   # with: submodules: 'recursive'
   ```

*Pros*: Allows making edits to the CMS and testing them directly inside the site in real time without publishing.  
*Cons*: High cognitive overhead; collaborators and CI must handle submodule checkouts (`git submodule update --init`); easily prone to detached `HEAD` states.

---

---

## 3. Step 2: Extracting Site-A into an Independent Git Repository

Using standard Git subtree splitting preserves the complete historical commit history of the site:

```bash
# 1. Inside the current monorepo, create a branch containing only site-a's history
git subtree split --prefix=sites/site-a -b site-a-standalone

# 2. In an empty directory, initialize the new repository
mkdir ../site-a-repo
cd ../site-a-repo
git init -b main

# 3. Pull the isolated history branch from the monorepo
git pull ../blog site-a-standalone

# 4. Update dependencies in package.json from workspace:* to published package versions:
#    "cms": "^0.1.0",
#    "blocks": "^0.1.0"

# 5. Push to the new GitHub repository
git remote add origin git@github.com:my-org/site-a.git
git push -u origin main
```

---

## 4. Step 3: Extracting CMS Core into an Independent Git Repository

```bash
# 1. Create a branch containing packages/cms and packages/blocks
# If keeping them together in a dedicated cms engine repo:
git clone --no-local . ../headless-cms-repo
cd ../headless-cms-repo

# Remove site content from the cms repo:
git rm -r sites/
git commit -m "chore: isolate headless-cms engine repository"

git remote add origin git@github.com:my-org/headless-cms.git
git push -u origin main
```

---

## 5. Step 4: Autonomous Site Configuration Verification

In the extracted `site-a-repo`:
1. **`wrangler.jsonc`**:
   ```json
   {
     "name": "site-a",
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
         "database_name": "site-a-db",
         "database_id": "<site-a-d1-uuid>",
         "migrations_dir": "node_modules/cms/migrations"
       }
     ]
   }
   ```
2. **`cms.config.ts`**:
   ```typescript
   import { defineConfig } from "cms/config";
   import { customSiteBlocks } from "./src/blocks";

   export default defineConfig({
     siteName: "Site A",
     contentDir: "src/content/blog",
     uploadsDir: "public/uploads",
     authors: [{ id: "jeflopo", name: "Jef Lopo" }],
     blocks: customSiteBlocks,
   });
   ```
3. **Run CI/CD Deploy**:
   Commit and push. GitHub Actions deploys the static assets to Cloudflare Assets, runs D1 migrations from `node_modules/cms/migrations`, and serves the publication globally.
