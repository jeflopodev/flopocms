# Headless CMS + sitios Astro SSG en Cloudflare: contraste con fuentes primarias y SotA

**Repo revision:** `5b3ce093958cf8a3dcab8b6fb564e30fb972f833` — `2026-09-28 15:22:01 +0200` — `docs: add multi-repo split and versioning guides`
**Date:** 2026-09-29 (claims verificados contra esta revisión; versiones de fuentes anotadas por cita)
**Style note:** sigue la convención de `docs/research/2026-09-22-*.md` (pregunta → respuesta en un párrafo → veredictos por claim con cita → SotA → problemas priorizados → fuentes). Solo fuentes primarias: docs oficiales, código fuente first-party, specs de API. Ningún write-up secundario sostiene un veredicto.

---

## Pregunta

Una conversación de review arquitectónica afirma seis cosas sobre este repo (integración `injectRoute`, middleware no inyectable, doble registro redundante, triple fuente de verdad de config, "CMS embebido, no headless", y una propuesta de `cms-app` separada). ¿Qué parte es verdad verificable contra el código y las fuentes primarias, y cuál es el SotA correcto para Headless CMS + sitios consumidores Astro SSG en Cloudflare?

## Respuesta en un párrafo

Cuatro claims se confirman total o parcialmente (1, 3, 4, 5), uno se refuta (2: `addMiddleware` existe desde Astro 3.5 y Starlight lo usa) y uno se avala con matices (6). El hallazgo de más leverage es el claim 4: `createServices` ignora el `GITHUB_REPO` del site y escribe siempre en el `DEFAULT_REPO` hardcodeado (`jeflopodev/blog-astro`), es decir, el write-path de `larutamotera` apunta al repo equivocado salvo que exista un override que no existe. El SotA tiene dos niveles: (A) manteniendo embebido, `addMiddleware` + registro único en runtime + una sola fuente de config + pin de versión del paquete; (B) headless real, `cms-app` SSR separada (admin+API+D1+PAT) con Git-`main` como Delivery Bus (patrón Decap) y sites SSG puros que solo contienen loader + renderer versionado.

---

## 1. Veredictos por claim

### Claim 1 — "`injectRoute` es el mecanismo canónico; la lista manual de 18 rutas es frágil y debería ser auto-glob como Starlight"

**Veredicto: confirmado con un matiz, y refutado en la premisa "como Starlight".**

- **Confirmado (canónico):** la referencia oficial de la Integration API documenta `injectRoute({ pattern, entrypoint, prerender? })` dentro del hook `astro:config:setup` como la vía para que una integración aporte rutas, con el ejemplo de publicar `@fancy/dashboard/dashboard.astro` vía `package.json exports`. Fuente: `https://docs.astro.build/en/reference/integrations-reference/` § `injectRoute() option` (leído 2026-09-29). Origen en código: PR `withastro/astro#3457` "feat: implement injectRoute" (merge 2022-06-14, commit `23fceb9`).
- **Confirmado (fragilidad real pero acotada):** `packages/cms/src/integration.ts:33-61` lista 18 rutas a mano. El riesgo existe (olvidar una ruta al añadir un fichero en `src/routes/`), pero el propio Astro lo convierte en fallo ruidoso y no silencioso: el diff del PR #3457 (`packages/astro/src/core/routing/manifest/create.ts`) muestra que una colisión de ruta inyectada lanza `Error("An integration attempted to inject a route that is already used...")`. Lo que no hay es detección de ruta *faltante*; eso sigue siendo manual.
- **Refutado ("auto-glob como Starlight"):** Starlight no hace glob de entrypoints. Su integración (`withastro/starlight`, `packages/starlight/index.ts`, rama `main`) llama `injectRoute` un número fijo de veces con patrones literales: `pattern: '404'` y `pattern: '[...slug]'` con entrypoints `@astrojs/starlight/routes/static|ssr/...`. La generalización de Starlight no viene de descubrir ficheros sino de **un catch-all `[...slug]` + content collection**. Por tanto el SotA para reducir la lista no es "glob como Starlight" sino: (a) colapsar rutas admin/API en menos entrypoints con segmentos dinámicos, o (b) generar la lista desde un manifiesto co-ubicado (p. ej. `readdir` de `src/routes/` en tiempo de setup), manteniendo `injectRoute` explícito por llamada, que es lo documentado.

### Claim 2 — "El middleware Astro no se puede inyectar desde una integration y obliga al shim de 3 líneas en el site"

**Veredicto: refutado para Astro ≥ 3.5 (el repo usa Astro 7).**

- La Integration API expone `addMiddleware({ entrypoint, order: 'pre'|'post' })` en `astro:config:setup`, documentado como **"Added in: `astro@3.5.0`"**. Fuente: `https://docs.astro.build/en/reference/integrations-reference/` § `addMiddleware() option` (leído 2026-09-29). Acepta specifier de paquete o `URL` (esto último desde Astro 5.0).
- Starlight lo usa en producción: `addMiddleware({ entrypoint: '@astrojs/starlight/locals', order: 'pre' })` en `packages/starlight/index.ts` (verificado vía índice del repo, leído 2026-09-29).
- Estado del repo: `packages/cms/src/middleware.ts:1-77` contiene el guard real (`defineMiddleware`, protege `/admin` y `/api/admin/*`); `larutamotera/src/middleware.ts:1-3` es el shim de re-export (`export { onRequest } from "cms/middleware"`). La decisión 3 de `docs/adr/0016-admin-ui-from-cms-package.md` ("Astro resolves middleware from the site project, never from an integration") describe el comportamiento pre-3.5 o una limitación que ya no existe en `astro@^7.3.2` (pin en `larutamotera/package.json:25`).
- Matiz honesto: `addMiddleware` **compone**, no sustituye. Si el site define además su propio `src/middleware.ts`, ambos corren encadenados (`sequence`, orden `pre`/`post`); la guía de middleware (`https://docs.astro.build/en/guides/middleware/` § Chaining middleware) rige la composición. Eliminar el shim es correcto, pero hay que fijar `order: 'pre'` y documentar que el site no debe duplicar el guard.

### Claim 3 — "Doble registro (`setCmsConfig`+`registerCustomBlocks` en `astro:config:setup` + plugin Vite `virtual:cms-init`) redundante/frágil por singletons globales"

**Veredicto: confirmado, con tres defectos verificados y uno de peso muerto.**

- **Doble escritura verificada:** `packages/cms/src/integration.ts:23-29` ejecuta `setCmsConfig(siteConfig)` + `registerCustomBlocks(siteConfig.blocks)` en el cuerpo de `cmsAdmin()` (tiempo de evaluación de config), y `integration.ts:83-111` registra además el plugin Vite `cms-runtime-init` que en `load()` re-ejecuta `registerCustomBlocks(siteConfig.blocks, true)` (nótese `allowOverride=true` solo en la segunda vía).
- **Defecto A (cobertura parcial):** solo dos ficheros importan `virtual:cms-init` en todo el paquete: `src/components/article-fragment.astro:2` y `src/routes/admin/posts/[id].astro:4` (grep 2026-09-29). Cualquier otro camino de ejecución que llame `getBlock`/`renderDocument` (build/prerender de otras páginas, endpoints, tests del site) no recibe los bloques custom. El `ensureLoaded()` de `packages/blocks/src/registry.ts:134-151` solo descubre bloques core por `import.meta.glob("./*/index.ts")`; los custom dependen enteramente de que el módulo virtual haya sido importado en ese grafo.
- **Defecto B (asimetría de override):** la vía config-time llama `registerCustomBlocks(blocks)` con `allowOverride=false` (lanza en tag duplicado, `registry.ts:98-101`), la vía runtime permite override. Mismo input, dos políticas.
- **Defecto C (singleton por instancia):** `packages/cms/src/config.ts:37` (`let activeConfig`) vive por instancia de módulo; en `workerd`/SSR cada isolate o re-evaluación parte de `{}`. El `setCmsConfig` de config-time no se propaga al runtime del Worker: solo la vía `virtual:cms-init` tiene efecto allí.
- **Peso muerto verificado:** `getCmsConfig` (config.ts:50) no tiene ningún lector en `packages/cms/src` (grep 2026-09-29: solo definición). `setCmsConfig` es escritura sin lectura.

### Claim 4 — "Triple fuente de verdad (`cms.config.ts` vs wrangler vars vs defaults `sites/site-a` + `DEFAULT_REPO`); `services.ts` ignora `cms.config`"

**Veredicto: confirmado. Es el hallazgo más grave: el write-path apunta al repo equivocado.**

- **Vía ignorada 1 — `cms.config.ts`:** `larutamotera/cms.config.ts:4-7` declara `contentDir: "src/content/blog"`, `uploadsDir: "public/uploads"`. Nada en el write-path los lee: `post-lifecycle.ts:144,217,226,334,464,483,486` consume `services.contentDir/uploadsDir`, y `services.ts:63-64` los resuelve exclusivamente vía `getContentDir/getUploadsDir` (env/workers vars), nunca vía `getCmsConfig`. Verificado por grep 2026-09-29.
- **Vía ignorada 2 — `GITHUB_REPO`:** `larutamotera/wrangler.jsonc:14` declara `"GITHUB_REPO": "jeflopodev/larutamotera"`. Ningún módulo de `packages/cms/src` lee esa clave (grep `GITHUB_REPO`: cero lectores). En su lugar, `services.ts:59` construye `new HttpGithubContents({ pat, repo: DEFAULT_REPO })` con `DEFAULT_REPO = "jeflopodev/blog-astro"` (`github-contents.ts:12`). **Consecuencia: publicar desde `larutamotera` escribe en `jeflopodev/blog-astro`, no en el repo del site.** El `CmsConfig` (`config.ts:26-35`) ni siquiera tiene campo `repo`, así que tampoco hay vía declarativa.
- **Defaults legacy:** `env.ts:46-47` (`DEFAULT_CONTENT_DIR/DEFAULT_UPLOADS_DIR` bajo `sites/site-a/...`) son restos monorepo que solo no pican porque las vars de wrangler los tapan en este site; un segundo site sin vars heredaría paths de otro proyecto.
- **PAT como var:** la guía del adapter Cloudflare (`https://docs.astro.build/en/guides/integrations-guide/cloudflare/` § Environment variables and bindings) distingue `vars` en `wrangler.jsonc` (no sensibles) de secrets vía `npx wrangler secret put <KEY>` (más `.dev.vars` local). `GITHUB_PAT` es un token con scope `repo` (requerido por la Contents API para escribir, cfr. `docs.github.com/en/rest/repos/contents` § Create or update file contents) y debe ser secret, nunca var versionada.

### Claim 5 — "Lo actual es CMS embebido (mismo Worker/build, import profundo `cms/lib/*`), no headless clásico; el read-path público ya lee de Git `main` sin D1"

**Veredicto: confirmado en lo esencial, matizado en el detalle del read-path.**

- **Embebido, verificado:** `larutamotera/package.json:20-21` depende de `github:jeflopodev/flopocms#path:packages/cms` (sin tag/commit → sin pin); cinco ficheros del site importan profundo `cms/lib/*` y `cms/components/*` (grep: `content.config.ts`, `middleware.ts`, `login.astro`, `preview.astro`, `[...slug].astro`, `index.astro`, `blog/index.astro`); admin + API + D1 + PAT comparten Worker y build (`wrangler.jsonc:16-23` con `d1_databases` + `migrations_dir: node_modules/cms/migrations`); `astro.config.mjs:16-19` usa el adapter Cloudflare en modo SSR híbrido.
- **Qué es headless "de verdad" (primarias):** Strapi genera endpoints REST por content-type (`GET/POST /api/:pluralApiId`, `GET/PUT/DELETE /api/:pluralApiId/:documentId`) con API tokens y permisos, separados del admin panel (fuente: `https://docs.strapi.io/cms/api/rest` § Endpoints, leído 2026-09-29). Sanity separa `drafts.<id>` / `versions.<release>.<id>` del documento publicado y sirve a no-autenticados solo la perspectiva `published` (fuente: `https://www.sanity.io/docs/content-lake/drafts`, leído 2026-09-29). Contentful separa CDA (`cdn.contentful.com`, read-only, para delivery) de CMA (`api.contentful.com`, read-write, para gestión) más Preview API para borradores (fuente: `contentful.com/developers/docs/references/api-basics` + `/content-delivery-api/overview` + `/content-management-api/overview`, vía índice oficial, leído 2026-09-29). El invariante común: **el site de producción solo toca una Delivery API de lectura; nunca comparte proceso, DB ni secretos de escritura con el CMS.**
- **Matiz del read-path:** `[...slug].astro:13-21` + `git-bundle.ts:56-60` leen vía `getCollection("blog")` (content collection de Astro sobre el checkout local del build), no vía API a `main` en runtime. "Lee de Git `main` sin D1" es cierto solo en el sentido build-time (el deploy se construye sobre `main`); en runtime no hay ninguna llamada a GitHub en el path público, y el "contrato" de delivery es código compartido (`cms/lib/*`), no un bus versionado.

### Claim 6 — "Propuesta: `cms-app` separada (admin+API+D1+PAT) que escribe vía GitHub Contents API, sites SSG puros con solo loader+renderer; login/preview fuera del site con slots"

**Veredicto: avalado en la dirección, con dos matices de implementación.**

- **Avalado (bus-Git):** Decap CMS valida el patrón: admin desacoplado + backend Git (`git-gateway`, folder/file collections, editorial workflows) donde Git es el bus y el site se reconstruye (fuente: `https://decapcms.org/docs/git-gateway-backend/` + `/docs/configuration-options/`, leído 2026-09-29). La Contents API exige `sha` del blob en escrituras/borrados (409 en conflicto) y uso serial de PUT/DELETE (fuente: `https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28`, leído 2026-09-29); la atomicidad multi-fichero vive en la Git Database API (blobs→tree→commit→ref `force:false`), que el repo ya implementa en `commitFiles` (`github-contents.ts:296-366`). El write-path propuesto no necesita cambiar de protocolo.
- **Avalado (site SSG puro):** la guía de Content Collections (`https://docs.astro.build/en/guides/content-collections/`, leída 2026-09-29) prescribe build-time collections (`loader` + `schema`, `glob()`/`file()` o loader custom) para contenido estático, y desaconseja live collections salvo frescura en tiempo real por sus límites explícitos (sin MDX, sin optimización de imágenes, coste por request, sin persistencia en el data store). Un site solo-lectura con `glob()` + `getStaticPaths` es el diseño idiomático; el adapter Cloudflare sobra (`"If you're using Astro as a static site builder, you don't need an adapter"`).
- **Matiz 1 (preview/login "con slots"):** Astro no tiene slots cross-deploy. Las opciones reales son: preview como ruta SSR dentro de `cms-app` (lee D1 + mismo renderer empaquetado) a lo Sanity-preview-perspective, o deploy previews por push. Login fuera del site es correcto (el site puro no tiene sesiones ni D1), pero no vía slots sino vía ausencia total de auth en el site.
- **Matiz 2 (ownership del renderer):** si ambos lados renderizan (site en build, cms-app en preview SSR), el renderer no puede pertenecer a ninguno: debe quedarse en el paquete `blocks` versionado que ambos consumen. La propuesta "solo loader+renderer" en el site es correcta siempre que `renderer` signifique dependencia versionada, no código copiado.

---

## 2. SotA correcto

### Nivel A — Mínimo automático, manteniendo embebido

Objetivo: un solo deploy, cero rutas/manual-sync olvidadizo, una sola fuente de config, builds reproducibles.

1. **Middleware vía integración.** `cmsAdmin()` llama `addMiddleware({ entrypoint: new URL('./middleware.ts', import.meta.url), order: 'pre' })`; borrar `larutamotera/src/middleware.ts`. Cita: Integration API § `addMiddleware()`, `astro@3.5.0`.
2. **Rutas desde manifiesto, no lista literal.** Generar el array de `injectRoute` recorriendo `src/routes/` del paquete en `astro:config:setup` (o colapsar `/api/admin/*` en menos entrypoints dinámicos). Mantener `injectRoute` por ruta: es lo documentado; lo que se automatiza es el descubrimiento.
3. **Una sola fuente de config.** `cms.config.ts` leído una vez en `astro:config:setup` (ya se resuelve su path en `integration.ts:69-81`: pasarlo al módulo virtual en lugar de re-importar por convención) → propaga `contentDir/uploadsDir/repo` al runtime vía `virtual:cms-init`; `env.ts` pasa a ser fallback (vars explícitas > `cms.config` > error, nunca defaults de otro site). Añadir `repo?: string` a `CmsConfig`; `createServices` usa `GITHUB_REPO` (var) > `cms.config.repo` > error — eliminar `DEFAULT_REPO` y los `DEFAULT_*_DIR` de `sites/site-a`.
4. **Registro único en runtime.** Borrar `setCmsConfig`/`registerCustomBlocks` del cuerpo de `cmsAdmin()`; registrar solo vía `virtual:cms-init` (con `allowOverride` documentado) y garantizar su importación en un punto raíz (p. ej. el layout/fragmento que toda ruta admin ya importa) en vez de dos ficheros sueltos. Borrar `getCmsConfig`/`setCmsConfig` (sin lectores) o darles su primer lector real.
5. **Secretos y versionado.** `GITHUB_PAT` vía `wrangler secret put` + `.dev.vars`, jamás en `wrangler.jsonc` (adapter docs § Environment variables and bindings). Pinear la dependencia a tag/commit (`github:jeflopodev/flopocms#<tag>#path:...` o cuts de release) en vez de rama implícita.
6. **D1 `batch()` para multi-writes del mismo store** (fuente: `developers.cloudflare.com/d1/worker-api/d1-database/` § `batch()`: "Batched statements are SQL transactions… aborts or rolls back the entire sequence"). GitHub↔D1 nunca es una transacción: projector idempotente por commit-sha + reconciliación en deploy, como ya recogen ADR-0012 y el research de divergencia.

**Site ideal (A):** `astro.config.mjs` (cloudflare + `cmsAdmin(siteConfig)`, sin `src/middleware.ts`), `cms.config.ts` completo (única verdad declarativa), `wrangler.jsonc` con `CONTENT_DIR/UPLOADS_DIR/GITHUB_REPO` como vars + `DB` D1 + PAT como secret, `src/pages/{admin/login,admin/posts/[id]/preview}` (excepciones de chrome, ADR-0016), `src/content.config.ts` con `glob()` + schema, dependencia `cms` pineada.

### Nivel B — Headless real, deploys separados

Objetivo: el site de producción no contiene ni ejecuta nada editorial.

- **`cms-app` (deploy 1, SSR en Cloudflare):** `admin/*`, `/api/admin/*`, login, preview SSR, D1, `GITHUB_PAT` (secret), `migrations_dir`. Escribe al repo de contenido del site vía Contents API (single-file) / Git Data API (`commitFiles` atómico, ya implementado). Expone, si hace falta lectura live, una Delivery JSON mínima versionada (OpenAPI) + Preview con auth; si no, el Delivery Bus es Git-`main` (patrón Decap).
- **`site` (deploy N, SSG puro):** sin adapter (`output: static`), sin D1, sin PAT, sin `/admin`, sin middleware. Contenido: `src/content.config.ts` con `loader: glob()` + `schema` (o loader custom contra la Delivery JSON de `cms-app` en build). Render: paquete `blocks` versionado (mismo que usa `cms-app` para el preview → paridad por construcción). Rebuild por push a `main` (CI/deploy hook); `getStaticPaths` sobre la colección.
- **Contratos:** (i) Git — Post Bundle (`index.mdx` + frontmatter validado por el schema Zod del loader) versionado por commit-sha; (ii) opcional HTTP — OpenAPI de la Delivery/Preview de `cms-app` si algún site necesita live data (con los límites de live collections asumidos). Nunca imports de código como contrato.
- **Auth/preview:** auth (sesiones PBKDF2 actuales) vive solo en `cms-app`; el site no tiene cookies ni sesiones. Preview = ruta SSR en `cms-app` con el renderer compartido (equivalente a la perspectiva `drafts` de Sanity / Preview API de Contentful), o deploy preview efímero.

**Site ideal (B):** `astro.config.mjs` sin adapter; `package.json` con solo `blocks@<tag>` (+ `astro`, `mdx` como loader si aplica); `cms.config.ts` reducido a presentación (theme/autores/templates); `wrangler.jsonc` con solo `assets.directory` (o ningún wrangler si el hosting es estático puro); `src/pages/blog/[...slug].astro` + `src/content.config.ts`; cero `cms/lib/*`, cero D1, cero PAT. Todo lo demás vive en `cms-app`.

---

## 3. Problemas verificados y solución, priorizados

| # | Problema (verificado) | Evidencia | Solución | Nivel |
|---|---|---|---|---|
| P0 | El write-path ignora `GITHUB_REPO` y publica en `DEFAULT_REPO` (`jeflopodev/blog-astro`) | `services.ts:59`, `github-contents.ts:12`, `wrangler.jsonc:14`, grep `GITHUB_REPO` sin lectores | Leer `GITHUB_REPO` en `createServices` (+ `repo?` en `CmsConfig` como fallback); borrar `DEFAULT_REPO` | A |
| P0 | `GITHUB_PAT` sin disciplina de secret | adapter docs § env/secrets; Contents API exige scope `repo` | `wrangler secret put GITHUB_PAT` + `.dev.vars`; prohibir PAT en `wrangler.jsonc` | A |
| P1 | Doble registro config-time + `virtual:cms-init` con políticas de override distintas y cobertura parcial (2 importadores) | `integration.ts:23-29,83-111`, `registry.ts:92-107`, `article-fragment.astro:2`, `[id].astro:4` | Registro único en runtime; importar el módulo virtual en punto raíz; unificar `allowOverride`; borrar `setCmsConfig`/`getCmsConfig` o darles lector | A |
| P1 | `cms.config.ts` (`contentDir/uploadsDir`) ignorado por el write-path; triple fuente efectiva | `cms.config.ts:6-7` vs `services.ts:63-64` vs `env.ts:46-47` | Una sola verdad: `cms.config` > vars > error; borrar defaults `sites/site-a` | A |
| P1 | Dependencia `cms` sin pin (rama implícita) → builds irreproducibles | `package.json:20-21` | Pinear a tag/commit; documentar política de upgrades (ADR-0013 ya prevé "explicit version bumps") | A |
| P2 | Shim de middleware manual pudiendo ser `addMiddleware` | `middleware.ts` (cms) vs `src/middleware.ts` (site); Integration API § `addMiddleware` (`3.5.0`); Starlight `index.ts` | `addMiddleware({ entrypoint, order: 'pre' })` en `cmsAdmin()`; borrar shim | A |
| P2 | 18 rutas literales sin descubrimiento | `integration.ts:33-61` | Generar desde `readdir` de `src/routes/` o colapsar en entrypoints dinámicos; la colisión ya falla en build (PR #3457) | A |
| P2 | Imports profundos `cms/lib/*` como API pública accidental | 7 ficheros del site; `package.json` sin `exports` restrictivo | Congelar superficie pública vía `package.json exports` (`integration`, `config`, `content`, `middleware`, `components/*`) | A/B |
| P3 | Admin+API+D1+PAT comparten Worker/build con el site público | `wrangler.jsonc`, `astro.config.mjs`, § claim 5 | Nivel B: `cms-app` SSR separada; sites SSG puros; Git-`main` como Delivery Bus | B |

---

## 4. Fuentes (primarias, todas leídas 2026-09-29 salvo nota)

**Astro (docs oficiales + código first-party):**

- Integration API, `injectRoute()` — `https://docs.astro.build/en/reference/integrations-reference/` § `injectRoute() option` (patrón `@fancy/dashboard` + `package.json exports`; `entrypoint` como `URL` desde `5.0.0`).
- Integration API, `addMiddleware()` — misma página, § `addMiddleware() option` ("Added in: `astro@3.5.0`", `{ entrypoint, order: 'pre'|'post' }`).
- Middleware (uso y `sequence`) — `https://docs.astro.build/en/guides/middleware/` (§ Basic Usage: `src/middleware.js|ts` exporta `onRequest`, no default; § Chaining middleware).
- Content Collections (build-time vs live, límites de live: sin MDX, sin image optimization, coste por request, sin persistencia) — `https://docs.astro.build/en/guides/content-collections/`.
- Content Loader API (`glob()`/`file()`/custom, `defineCollection`, `defineLiveCollection`) — `https://docs.astro.build/en/reference/content-loader-reference/`.
- Cloudflare adapter (sin adapter para static; `vars` vs `wrangler secret put`; `.dev.vars`; bindings) — `https://docs.astro.build/en/guides/integrations-guide/cloudflare/`.
- Starlight `packages/starlight/index.ts` (`withastro/starlight`, `main`): `addMiddleware({ entrypoint: '@astrojs/starlight/locals', order: 'pre' })` + `injectRoute` fijo (`'404'`, `'[...slug]'`).
- `withastro/astro#3457` + commit `23fceb9` (2022-06-14): origen de `injectRoute`; colisión = `Error` en `createRouteManifest`.

**Cloudflare:**

- D1 `batch()` transaccional — `https://developers.cloudflare.com/d1/worker-api/d1-database/` (actualizado 2026-06-22).

**CMS headless (definición de "headless de verdad"):**

- Strapi REST API por content-type + API tokens + permisos — `https://docs.strapi.io/cms/api/rest` § Endpoints.
- Sanity drafts (`drafts.`/`versions.`), perspectivas `published`/`drafts`, `_updatedAt` no es señal de publish — `https://www.sanity.io/docs/content-lake/drafts`.
- Contentful CDA (`cdn.contentful.com`, read-only) vs CMA (`api.contentful.com`, read-write) vs Preview API — `contentful.com/developers/docs/references/api-basics` + `.../content-delivery-api/overview` + `.../content-management-api/overview`.

**Git-backed CMS (bus-Git):**

- Decap Git Gateway + backends + folder/file collections — `https://decapcms.org/docs/git-gateway-backend/`.

**GitHub API:**

- Contents API (`sha` requerido, 409, PUT/DELETE en serie) — `https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28`.

**Código del repo (revisión `5b3ce09`):**

- `flopocms/packages/cms/src/integration.ts:23-29,33-61,69-111` · `config.ts:26-59` · `lib/env.ts:46-55` · `lib/services.ts:52-83` · `lib/github-contents.ts:12,296-366` · `packages/blocks/src/registry.ts:92-151` · `src/middleware.ts:1-77` · `src/components/article-fragment.astro:2` · `src/routes/admin/posts/[id].astro:4` · `lib/article-sources/git-bundle.ts:56-60`.
- `larutamotera/astro.config.mjs:15-19` · `cms.config.ts:1-22` · `src/middleware.ts:1-3` · `src/content.config.ts:1-6` · `src/pages/blog/[...slug].astro:1-32` · `src/pages/admin/login.astro:1-9` · `src/pages/admin/posts/[id]/preview.astro:1-28` · `wrangler.jsonc:1-24` · `package.json:19-28`.
- `flopocms/docs/adr/0013-packages-cms-vs-sites-split.md` · `0016-admin-ui-from-cms-package.md` · `0017-pluggable-site-blocks-and-declarative-config.md`.
