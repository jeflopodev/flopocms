# FlopoCMS

A decoupled, Git-backed headless CMS engine for Astro sites with pluggable declarative blocks, pure Cloudflare Assets (zero Cloudflare R2), bare-text prose authoring, and D1 database migrations.

---

## 📦 Packages

| Package | Version | Description |
| :--- | :--- | :--- |
| **`@jeflopodev/blocks`** | `0.1.0` | Pluggable JSX Block DSL parser, serializer, renderer, and standard blocks (`<Callout>`, `<Youtube>`, `<PricingTable>`, etc.). |
| **`@jeflopodev/cms`** | `0.1.0` | Core CMS engine: Admin dashboard, CodeMirror bare-text editor, D1 migrations, session auth, and Astro integration plugin. |

---

## 🚀 Key Architecture Highlights

1. **Pluggable Site Blocks**: Every consumer site can define site-specific custom blocks (with schemas, build-time SSR data, client Web Components, and styles) registered cleanly via `cms.config.ts`.
2. **Zero Cloudflare R2**: All media uploads are committed directly to `public/uploads/` on `main` via `GitHubMediaAdapter` and bundled by Astro into `./dist/uploads/` for immutable Cloudflare Assets edge serving.
3. **Pure Static Posts (SSG)**: Public blog posts render to 100% pre-rendered static HTML at build time, while custom blocks can include zero-dependency Web Components for live client interactions.
4. **No Markdown in Editor**: Bare-text prose authoring (double newlines create paragraphs) with semantic marks and declarative JSX block tags.

---

## 🛠️ Installation in Consumer Sites

### Option A: From GitHub Packages

Add `@jeflopodev` registry to your site's `.npmrc`:
```ini
@jeflopodev:registry=https://npm.pkg.github.com
```

In `package.json`:
```json
{
  "dependencies": {
    "cms": "npm:@jeflopodev/cms@^0.1.0",
    "blocks": "npm:@jeflopodev/blocks@^0.1.0"
  }
}
```

### Option B: Direct Git Dependencies

Zero registry setup required:
```json
{
  "dependencies": {
    "cms": "git+https://github.com/jeflopodev/flopocms.git#v0.1.0&subdirectory=packages/cms",
    "blocks": "git+https://github.com/jeflopodev/flopocms.git#v0.1.0&subdirectory=packages/blocks"
  }
}
```

---

## 🧪 Testing

```bash
pnpm install
pnpm test
```

---

## 📄 License

MIT © 2026 jeflopodev
