# oxc-parser for the JSX DSL: Addendum to the Hand-Parser Verdict

**Repo revision:** `be38554bd0faffdcf4ba599b8e004a6645b9cb20` — `Tue Sep 22 04:01:26 2026 +0200` — `docs: add codebase architecture doc; deepen Post Lifecycle, Asset Registry, and Block Registry` (working tree has uncommitted changes on top; see `git status`)
**Date:** 2026-09-22 (claims are revision-specific; versions read are noted per source)
**Scope note:** R2 and all usage-billed stores are out of scope per operator constraint — nothing below proposes one.
**Style note:** follows the convention of `docs/research/2026-09-22-editorial-workflow-without-divergence.md` and `docs/research/2026-09-22-elegant-block-cms-rearchitecture.md` (question → one-paragraph answer → diagnosis → principles → options → recommendation → plan → open questions → sources). This note is the oxc addendum to `docs/research/2026-09-22-jsx-dsl-parsing-in-astro.md` (the prior note), which recommended hardening the hand parser without evaluating oxc — it tests that verdict.

---

## Question

Would it be better to use [oxc-parser](https://oxc.rs/docs/guide/usage/parser) for our JSX DSL Blocks than the manual parser in `src/blocks/dsl/parser.ts` (~489 lines: hand-rolled `tokenizeDsl` + `parseJsxExpressionValue` regex-rewrite + `inspectDocument` recovery + Valibot validation)?

## Answer in one paragraph

**No — not on the render path, and the reason is environmental before it is technical.** The default `oxc-parser` entry loads a napi native addon (`./bindings.js` → a platform `.node` binary), and native addons are unloadable in Cloudflare Workers: Wrangler fails the bundle with `No loader is configured for ".node" files`, closed by Cloudflare as "we do not have plans to support `.node` files at this time", and the workerd team states native add-ons are "likely never to be supported by workers" — while this repo's SSR preview (`src/pages/admin/posts/[id]/preview.astro`, `export const prerender = false`) runs `renderDocument` on workerd and must stay byte-identical with the SSG build (`src/pages/blog/[...slug].astro`) through the single Article Display module. The WASM fallback does not rescue this: it ships as the separate `@oxc-parser/binding-wasm32-wasi` package (~2.07 MB unpacked plus emnapi runtimes) whose loader needs `node:wasi`, `node:worker_threads`, `node:fs`, and threads — but Workers expose `node:wasi`/`node:worker_threads` as non-functional stubs, do not support threading or the Web Worker API, and call WASI support experimental with only some syscalls. Past the runtime wall, the functional trade is also negative for *this* DSL: oxc is a partially-recoverable real-JSX parser (bare text is a syntax error, adjacent top-level elements need a wrapper, `{…}` holds arbitrary JS expressions you must then allowlist-evaluate, comments come back detached and the documented printer drops them), so adopting it keeps the Valibot layer, the recovery layer, the bare-text layer, the comment layer, and the serializer while adding a ~3.5 MB dependency and a wrap/unwrap offset-remap seam — and it would put two parsers' truth (or one parser's truth plus an oxc lint that disagrees with it) into a system whose parity invariant forbids exactly that. The prior note's verdict stands: harden the hand parser (its five defects are local and dependency-free to fix). The one honest credit to record is that oxc is the existence proof for gap 3 of the prior note — UTF-16 `start`/`end` on every node and error labels with spans are exactly the position model the hand parser should copy.

---

## 1. Diagnosis: what the hand parser is actually selling

Read at this revision: `src/blocks/dsl/parser.ts` (489 lines), `renderer.ts`, `serializer.ts`, `index.ts`, `inspect.test.ts`, `src/blocks/types.ts`, `marks.ts`, `insertion.ts`, `registry.ts`, `paragraph`/`callout`/`youtube`/`image` block defs, `src/components/article-display.astro`, `src/pages/blog/[...slug].astro`, `src/pages/admin/posts/[id]/preview.astro`, `src/content.config.ts`, `astro.config.mjs`, `package.json`, `wrangler.jsonc`.

The hand parser's value is not tokenizing — it is four forgiving behaviors no real JSX parser provides, all load-bearing for two non-technical authors:

1. **Total recovery.** `inspectDocument` (`parser.ts:283-479`) never throws: unknown tags become blocks plus an `unknown-block` problem, schema failures fall back to defaults plus `invalid-props`, misnesting re-parents plus `recovered-tag`, unterminated comments are reported plus `unterminated-comment`. Rendering is therefore total by construction.
2. **Bare-text auto-paragraphing** (`parser.ts:295-311`): root-level text becomes a `Paragraph` block. Bare text is not valid JSX at all (see §4.3), so this behavior is a pre-parser the adopter must write and keep.
3. **JSON-subset expressions by construction** (`parser.ts:23-53`): `{…}` props can only ever become JSON-ish values or a raw string — never code. A real parser hands you arbitrary JS AST and the restriction must be re-imposed as an allowlist (see §4.4).
4. **Inspect/parse split with author-grade problem codes.** `inspectDocument` vs `parseDslToBlocks`, four codes, two severities — the vocabulary the editor lint and the lifecycle refusal (`refuseUnrenderableBody`) already speak.

The defects are the prior note's five (§1.2–§1.3 there): unsound expression regex-rewrite, string-blind brace counting, no positions, non-deterministic IDs, unescaped prop interpolation. Any replacement must fix or inherit each. oxc fixes exactly one of the five (positions) while re-opening totality, bare text, and expression safety as new work.

## 2. What oxc-parser actually is (primary sources only, all read 2026-09-22)

Version pinned throughout: `oxc-parser@0.151.0` (npm registry metadata, `dist.unpackedSize` and binding table below are from `https://registry.npmjs.org/oxc-parser/latest` and the per-package `…/latest` endpoints).

**API shape.** Two functions, `parseSync(filename, sourceText, options?)` and async `parse(...)`, returning a `ParseResult` with getters for `program`, `module` (ESM info), `comments`, and `errors` — syntax errors are collected into the `errors` array, not thrown ([napi/parser README](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/README.md); [generated `src-js/index.d.ts`](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/index.d.ts)). The async variant's own docs warn that "deserialization of the AST to JS objects has to happen on current thread" and "typically outweighs the asynchronous parsing by a factor of between 3 and 20", so "`parseSync` is preferable" ([`src-js/index.d.ts`](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/index.d.ts), `parse` docblock). Options are `lang: 'js' | 'jsx' | 'ts' | 'tsx' | 'dts'` (default from filename extension — no Babel-style plugin setup needed), `sourceType` (`script`/`module`/`commonjs`/`unambiguous`), `astType` (`js`/`ts`), `range` (default `false`; adds a `[start, end]` tuple — plain `start`/`end` numbers are always present, as the test snapshots confirm), `preserveParens` (default `true`: emits non-standard `ParenthesizedExpression` nodes), `showSemanticErrors` (default `false`) ([`src-js/index.d.ts`](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/index.d.ts), `ParserOptions`).

**AST shape.** For JS/JSX the AST "is fully conformant with the ESTree standard, the same as produced by Acorn" (TS files get TS-ESTree); deviations are enumerated and unrelated to JSX (decorators, `import defer`/`source`, `hashbang`) ([napi/parser README](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/README.md), "ESTree" section). The concrete JSX node inventory this implies — `JSXElement{openingElement, closingElement?, children}`, `JSXFragment`, `JSXOpeningElement{name, attributes, selfClosing}`, `JSXAttribute{name, value?}`, `JSXSpreadAttribute{argument}`, `JSXExpressionContainer{expression: Expression | JSXEmptyExpression}`, `JSXText{value}`, children drawn from `JSXText | JSXExpressionContainer | JSXSpreadChild | JSXElement | JSXFragment`, names as `JSXIdentifier | JSXMemberExpression | JSXNamespacedName` — is pinned in first-party source at [babel-types `definitions/jsx.ts`](https://raw.githubusercontent.com/babel/babel/main/packages/babel-types/src/definitions/jsx.ts), the reference implementation of that ESTree surface. Two consequences for the adapter: fragments and member-expression tags (`<A.B/>` — which the hand parser cannot even tokenize, prior note gap 6) come for free; and `JSXExpressionContainer` accepts *any* `Expression`, which is the over-breadth problem of §4.4.

**Error model.** Each error is `{ severity, message, labels: [{ message, start, end }], helpMessage, codeframe }` — offsets included, but **no stable machine-readable code** (contrast Babel's `reasonCode`, prior note P6) ([`src-js/index.d.ts`](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/index.d.ts), `OxcError`; [parse.test.ts "error" block](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/test/parse.test.ts) asserting exactly these fields). Recovery philosophy is stated by the project itself: "Most JavaScript parsers out there are partially recoverable, so we'll do the same and build a partially recoverable parser" ([Dealing with Errors](https://oxc.rs/docs/learn/parser_in_rust/errors.html)). Partially, not totally: on author typos you get an error list plus a best-effort tree, and mapping that onto "render *something* sensible" remains the caller's job — i.e. `inspectDocument`'s recovery semantics would need re-implementation on top, against an AST that was never designed to be complete when errors exist.

**Comments and positions.** Comments arrive as a detached array of `{ type: 'Line' | 'Block', value, start, end }` ([`src-js/index.d.ts`](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/index.d.ts), `Comment`; [parse.test.ts "matches output"](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/test/parse.test.ts)). All spans are UTF-16 code units ([parse.test.ts "UTF-16 span"](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/test/parse.test.ts)) — the same unit CodeMirror 6 uses for document offsets, so the position model is editor-compatible with no conversion. This is the single genuine capability win over the hand parser (prior note gap 3): free, exact, per-node lint positions.

**Footprint** (unpacked tarball bytes from the npm registry, same method as the prior note's size table):

| Artifact | Version | Unpacked | Notes |
|---|---|---|---|
| `oxc-parser` (JS glue: `src-js/index.js`, visitor, wrap) | 0.151.0 | 1,425,623 (~1.4 MB) | `type: module` (fine for this ESM repo); `engines: node ^20.19.0 \|\| >=22.12.0` (repo runs Node 22) |
| `@oxc-parser/binding-linux-x64-gnu` (native) | 0.151.0 | 2,122,208 (~2.1 MB) | `main: parser.linux-x64-gnu.node` — a napi `.node` addon |
| `@oxc-parser/binding-wasm32-wasi` (WASM fallback) | 0.151.0 | 2,068,823 (~2.07 MB) | `main: parser.wasi.cjs`, `browser: parser.wasi-browser.js`, plus `@emnapi/core`, `@emnapi/runtime`, `@napi-rs/wasm-runtime` deps |
| `@oxc-project/types` (AST typings) | 0.151.0 | 44,596 (~45 KB) | direct dependency of `oxc-parser` |
| Hand parser today | — | 0 bytes added | Valibot only, tree-shaken and dependency-free (prior note §1.4) |

Realistic install for the SSG build: ~1.4 MB + ~2.1 MB ≈ **~3.5 MB unpacked** for the native path — acceptable at build time, but every byte of the WASM path ships *inside the Worker bundle* and counts against Worker size/startup (§3). No postinstall compile step exists (pure `optionalDependencies`), so `pnpm install` succeeds — the failure surfaces later, at bundle/deploy time (§3).

**Serialization.** AST→source is explicitly not oxc's job: the usage page demonstrates printing via third-party `esrap` and notes in an INFO callout that "Today, comments are not printed" ([Parser usage page](https://oxc.rs/docs/guide/usage/parser)). Round-tripping through oxc therefore normalizes formatting and drops comments — the opposite of the current `serializer.ts`, whose whole purpose is author-formatting-preserving output for git-diffable bundles.

## 3. Runtime fit: workerd is the disqualifier

Principle (repo-specific, load-bearing): **SSG and SSR preview share one module, so a dependency must run in both Node and workerd, or it cannot be in the render path.** Production builds at deploy time in Node; preview (`preview.astro`, `export const prerender = false`) executes the same `renderDocument` via Article Display (`article-display.astro:26`) on workerd. The rearchitecture note calls this "parity-by-construction" (§1.1 item 3) with a byte-identical test. A parser that works in only one runtime splits that invariant.

**Native path: unloadable.** The default entry imports the platform binding directly (`import { parseSync as parseSyncBinding } from "./bindings.js"` — [src-js/index.js](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/index.js)). In Workers this fails at build time: Wrangler reports `No loader is configured for ".node" files` for napi-rs packages, closed by Cloudflare with "we do not have plans to support `.node` files at this time" ([workers-sdk#4913](https://github.com/cloudflare/workers-sdk/issues/4913)). The workerd team is blunter: "Node.js native add-ons are likely never to be supported by workers, for many reasons that aren't worth delineating" ([workerd discussion #1905](https://github.com/cloudflare/workerd/discussions/1905)). This alone removes oxc from `parser.ts` as long as preview runs on Workers.

**WASM path: wrong-shaped WASM.** The `browser` field points at `src-js/wasm.js`, which is `export * from "@oxc-parser/binding-wasm32-wasi"` ([wasm.js](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/wasm.js)) — a **separate package** that must be depended on explicitly, built for `wasm32-wasip1-threads`, and loaded through glue that requires `node:fs`, `node:module`, `node:path`, `node:wasi`, and `node:worker_threads` ([wasi-worker.mjs](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/src-js/wasi-worker.mjs)). Against the Workers runtime, point by point (all from first-party Cloudflare docs, read 2026-09-22):

- `node:wasi` and `node:worker_threads` are **non-functional stubs** — "can be imported or required, but [do] not provide a working implementation … not suitable for direct use in application code" ([Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), updated 2026-08-12; this repo's compat date `2026-09-16` auto-enables `nodejs_compat`, which only makes the stubs *importable*).
- "Threading is not possible in Workers. Each Worker runs in a single thread, and the Web Worker API is not supported" — while the binding target is literally `wasm32-wasip1-*threads*` ([WebAssembly on Workers](https://developers.cloudflare.com/workers/runtime-apis/webassembly/), updated 2026-04-23).
- "WASI support is experimental on Cloudflare Workers, with only some syscalls implemented" (same page).
- "Workers that use WebAssembly are typically larger than an equivalent Worker written in JavaScript. The larger your Worker is, the longer it may take your Worker to start" (same page) — against the 1 s startup budget and per-request CPU limits the preview pays per parse (limits cited in the prior note P4; size ceiling now "up to 64 MiB on all plans" per the [module-registry rewrite](https://blog.cloudflare.com/workers-module-registry-nodejs/), 2026-09-09).

So the WASM route is not a fallback but a second wall: a threads-and-WASI build for a runtime with no threads and stub WASI. (A single-threaded `wasm32-unknown-unknown` build of the oxc parser crate would be a different artifact that upstream does not publish — depending on it would mean building and publishing our own WASM, i.e. owning a toolchain, to parse blog posts.)

**Performance, honestly scoped.** oxc advertises "3x faster than swc" and Test262 plus 99% Babel/TypeScript conformance ([Parser usage page](https://oxc.rs/docs/guide/usage/parser)). Neither matters here: documents are hundreds of lines parsed once per render, and the project's own docs note deserialization (not parsing) dominates napi cost 3–20×. No repo-scale benchmark was run for this note because compatibility decides before speed is reached. If speed ever becomes the question, the comparison is against a ~500-line synchronous scanner, not against swc.

## 4. Functional fit: what maps, what breaks, what must be rebuilt

| DSL feature | Hand parser today | Under oxc-parser | Verdict |
|---|---|---|---|
| Fragments `<>…</>` | No special case (any tag name tokenizes) | `JSXFragment` node, first-class | oxc wins (unused by the DSL today) |
| Self-closing `<Image … />` | `selfClosing` token | `JSXOpeningElement.selfClosing` | Tie |
| Nested blocks + inline marks | Block stack + mark stacks, aliases (`<b>`, `<em>`, `<s>`, `<u>`) | Element nesting exact; mark aliases unknown to oxc — alias folding stays hand-written | Tie, with kept code |
| Unknown tags | `unknown-block` problem, still rendered | Any name parses (`JSXIdentifier`/`JSXMemberExpression`/`JSXNamespacedName`); registry check unchanged | Tie |
| Member tags `<A.B/>` | Fails (charset `[a-zA-Z0-9_-]`, prior note gap 6) | Parses | oxc wins (unused by the DSL today) |
| **Bare text** | Auto-wrapped in `Paragraph` | **Syntax error** — a document is not a JS program | Must pre-pass (§4.3) |
| **`{…}` expressions** | JSON-subset by construction (buggy) | Arbitrary JS AST — allowlist evaluator required | Must rebuild (§4.4) |
| **Recovery** | Total, with four problem codes | Partial + error list, no stable codes | Must rebuild (§4.5) |
| Comments `<!--…-->` | Tokenized, `unterminated-comment` reported | No counterpart in oxc's `Line`/`Block` comment model | Must pre-pass |
| Serializer round-trip | Formatting-preserving, hand-controlled | Third-party print, comments dropped, normalized | Regression (§2) |
| Valibot per-block validation | `v.safeParse` per tag | Unchanged — props object still built by us, still validated the same way | Tie (kept code) |
| Deterministic IDs | Broken (`Date.now`, prior note gap 4) | oxc gives no IDs; assignment stays ours (but `start` offsets make it trivially deterministic) | Tie, easier |

### 4.3 Bare text and the single-root rule

JSX is stricter than HTML: "To return multiple elements from a component, wrap them with a single parent tag… you can write `<>` and `</>` instead" ([React: Writing Markup with JSX](https://react.dev/learn/writing-markup-with-jsx)). A DSL document — N top-level blocks plus bare-text lines — is therefore unparseable as-is and must be wrapped (e.g. `<Fragment>…</Fragment>`) before `parseSync`. Bare text *inside* the wrapper parses as `JSXText` children (whitespace included), so the auto-paragraphing rule ("which text runs become `Paragraph` blocks, what happens to whitespace-only spans") must be re-implemented as an AST walk — against `JSXText` values whose whitespace semantics are JSX's, not the DSL's. And every span used for editor lint then lives in *wrapped* coordinates and must be remapped by the wrapper's prefix length — a new off-by-N seam sitting between the parser and the CodeMirror diagnostics the prior rearchitecture note plans (§3.4 item 2 there).

### 4.4 Expressions: from too little language to too much

Today `{…}` is a buggy JSON-subset reader (prior note gaps 1–2). Under oxc, `level={2}` arrives as `JSXExpressionContainer > NumericLiteral` (exact, typed, positioned — genuinely better), but so does `onClick={stealCookies()}` as a `CallExpression`, `{...spread}` as `JSXSpreadAttribute`, `` {`template ${x}`} `` as `TemplateLiteral`, and `{identifier}` as a bare `Identifier` with no scope to resolve in. The adapter must therefore contain a **closed-world literal evaluator** — accept `StringLiteral`/`NumericLiteral`/`BooleanLiteral`/`NullLiteral`, `ObjectExpression`/`ArrayExpression` of accepted nodes, `UnaryExpression(-)` on numbers, and reject-vs-default everything else — plus a policy for what rejection means (which problem code? `invalid-props` stretches to cover it, but the message must explain an AST concept to a prose author). The hand parser's restriction was unsound but *narrow by construction*; oxc's is sound but *broad by specification*, and narrowing it is new security-adjacent code (an over-permissive allowlist silently promotes author props to executable-shaped AST on the path to `set:html`). Fixing the ~80-line literal reader the prior note specifies is strictly less code and less risk than writing and auditing the allowlist.

### 4.5 Recovery: partial is not total

oxc returns errors *alongside* a best-effort `program` (see the `"asdf asdf"` error test asserting `errors[0]` shape while `program` remains accessible — [parse.test.ts](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/test/parse.test.ts)). But "best-effort" is the operative word: the project designs for *partial* recovery ([Dealing with Errors](https://oxc.rs/docs/learn/parser_in_rust/errors.html)), so unclosed tags, stray closes, and misnesting — the exact inputs `inspect.test.ts` pins as total — surface as one or more English `message` strings with `labels` spans and **no stable code**. Mapping those onto the four author-facing problem codes (`unknown-block`/`invalid-props`/`recovered-tag`/`unterminated-comment`) means string-matching compiler English, which breaks on every oxc upgrade. The alternative — replacing the four codes with oxc's raw messages — abandons the editor-lint vocabulary, the lifecycle refusal contract, and the nine existing tests. Either way the recovery layer is not reused; it is rewritten.

## 5. DX fit

**Lint positions.** oxc's model is the right one: every node carries UTF-16 `start`/`end`, errors carry `labels` with spans ([parse.test.ts](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/test/parse.test.ts)), and CodeMirror 6 offsets are UTF-16 — zero conversion. But positions arrive in *wrapped-document* coordinates (§4.3) and only for inputs oxc could partially parse; the hand parser with offsets added (prior note's fix: offset/line on tokens and problems) gives positions for *all* inputs including the broken ones that most need squiggles. Net: copy oxc's position *model*, not its parser.

**Autocomplete.** Unchanged either way — completions come from `getEditorBlockCards()` plus snippets (rearchitecture note §3.4 item 3), which never touches the parser.

**Error messages for authors.** oxc messages are compiler-grade ("Expected a semicolon or an implicit semicolon after a statement, but found none", with `helpMessage` and `codeframe` — [parse.test.ts](https://raw.githubusercontent.com/oxc-project/oxc/main/napi/parser/test/parse.test.ts)) and describe the *JSX* the author didn't write (they wrote DSL). The current codes describe the *DSL* the author did write ("`<Callout> is never closed`"). For two prose authors, the latter wins; oxc's codeframes would be an upgrade only as *supplementary* detail on a problem the DSL layer already named.

## 6. Migration cost: what exactly changes

If oxc were adopted despite §§3–4, the diff is:

- **New: `src/blocks/dsl/oxc-adapter.ts`** (~250–350 lines, net-new and untested today): wrap-in-`<Fragment>`, `parseSync("doc.jsx", wrapped, { lang: "jsx", range: true, preserveParens: false })`, walk `Program > ExpressionStatement > JSXElement|JSXFragment`, convert `JSXElement→BlockNode` (tag-name lowercasing + mark-alias folding + `Link` markDef extraction re-implemented on AST), `JSXText→InlineSpan` with auto-paragraphing re-implemented, `JSXExpressionContainer→literal` via the §4.4 allowlist evaluator, `Comment` array → `<!-- -->` pre-pass reconciliation, per-node `generateNodeId` from `start` offsets, `OxcError.labels → DocumentProblem` via message matching.
- **Kept, unchanged:** `registry.ts` lookups, Valibot `safeParse` per block, `renderer.ts`, problem-code vocabulary (if preserved), `insertion.ts`, editor snippets/drawer.
- **Rewritten or regressed:** `tokenizeDsl` (deleted, but its `<!-- -->` and bare-text behaviors re-appear inside the adapter as pre/post-passes — same logic, new address); `parseJsxExpressionValue` (replaced by the larger allowlist); `serializer.ts` (either kept against `BlockNode`, in which case oxc bought nothing for the write path, or replaced by `esrap`-class printing, which drops comments and normalizes formatting — a regression for git-diffable bundles); `inspect.test.ts` (re-pinned to message-matched codes); deterministic IDs become easy (`start`-derived) but every snapshot changes.
- **Broken structurally:** workerd SSR preview (build fails on `.node`; WASM path needs stubbed APIs); SSG==SSR parity (the one invariant with a byte-identical test); `pnpm allowScripts` posture (no new scripts needed, but platform `optionalDependencies` balloon install size for zero runtime gain).

Adapter sketch (the shape the estimate above assumes):

```ts
// src/blocks/dsl/oxc-adapter.ts — sketch, NOT recommended (see §7)
import { parseSync, type OxcError } from "oxc-parser";
import type { JSXElement, JSXFragment } from "@oxc-project/types";

const WRAP_OPEN = "<Fragment>";
export function inspectWithOxc(dsl: string): DocumentInspection {
  const wrapped = `${WRAP_OPEN}${dsl}</Fragment>`;
  const { program, errors } = parseSync("doc.jsx", wrapped, {
    lang: "jsx", range: true, preserveParens: false,
  });
  const problems = errors.map((e) => oxcErrorToProblem(e, WRAP_OPEN.length));
  // ...walk program.body[0] -> BlockNode[] (bare-text, marks, allowlist exprs)...
  return { blocks, problems };
}

function oxcErrorToProblem(e: OxcError, base: number): DocumentProblem {
  const span = e.labels[0]; // may be absent; labels have no codes to switch on
  return {
    severity: "unrenderable",
    code: "recovered-tag", // best guess: message-matching oxc English is fragile
    tagName: span ? `<offset ${span.start - base}>` : "<??>",
    message: e.message + (e.helpMessage ? ` — ${e.helpMessage}` : ""),
  };
}
```

The sketch's `tagName: <offset …>` line is the whole DX argument in miniature: oxc knows *where* but not *what the author meant*, and bridging that gap is the hand parser you just deleted.

## 7. Verdict with conditions

| Condition | Winner | Why |
|---|---|---|
| Render path (SSG + workerd SSR preview, must stay one module) | **Hand parser** | oxc cannot load in workerd (§3); parity forbids a split parser |
| Total recovery on author typos | **Hand parser** | Total vs partial (§4.5); the nine `inspect` tests pin totality |
| Bare-text documents, `<!-- -->` comments | **Hand parser** | oxc has no counterpart; pre-passes would re-implement the tokenizer |
| `{…}` prop expressions | **Hand parser, after the literal-reader fix** | ~80-line closed-world reader beats a full-JS allowlist + audit (§4.4) |
| Serializer round-trip preserving author formatting | **Hand parser** | oxc-side printing drops comments, normalizes (§2) |
| Exact error/node positions | **oxc (as a model to copy)** | UTF-16 spans everywhere; adopt the model, not the dependency (§5) |
| Member-expression tags, fragments | oxc | Real, but unused by the DSL; no author demand |
| Build-time-only lint with positions (Node, off the render path) | Either | The one place oxc *could* run — but it creates a second parser-truth; §8 keeps it out unless demand proves |
| If preview ever leaves workerd for Node | Revisit | The environmental disqualifier lifts; the functional costs (§4) remain and must still be priced |

**oxc wins only if the DSL stops being this DSL** — strict JSX, no bare text, no recovery, expressions evaluated rather than validated — or if the runtime stops being workerd. Neither is on any plan.

## 8. Recommendation and plan

**Recommendation: keep the hand parser; apply the prior note's five fixes; record oxc's position model as the spec for gap 3.** Concretely, in the prior note's Phase 0 order:

1. **Positions à la oxc** (prior gap 3, this note §5): `start`/`end` (UTF-16) on tokens and `DocumentProblem`s, plus line/column derivation — the CodeMirror lint seam then needs no wrapper-remap because coordinates are native DSL offsets.
2. **Literal reader** (gaps 1–2): the ~80-line total literal parser shared by the attribute scanner — narrower than oxc's expression world, so no allowlist audit.
3. **Deterministic IDs** (gap 4): `${type}-${start}-${siblingIndex}` — oxc's `start`-derived sketch shows the shape; no dependency needed to copy it.
4. **Escape boundary** (gap 5 / §1.3): `escapeAttr` everywhere on the `set:html` path — orthogonal to the parser choice and still the highest-severity item.

**Explicitly not recommended:** an oxc-backed lint script, editor WASM integration, or dual-parser validation — each adds a second source of parse-truth whose disagreements with `inspectDocument` become a new divergence class in a repo that just paid to delete one (see the divergence companion note). If editor-lint demand later outgrows `inspectDocument` diagnostics, the sanctioned fallback remains the prior note's: a Lezer grammar shared by parser and editor (incremental re-parse + editor-native nodes), not a batch compiler parser.

## 9. Open questions

1. **Does the `start`-offset ID scheme survive the serializer?** Serialize→parse must yield identical IDs for content-addressing to hold; needs a round-trip test (prior note's serializer gap).
2. **Should `DocumentProblem` gain `start`/`end` only, or full `labels[]`?** oxc's multi-label shape fits multi-tag misnesting messages ("`</X>` closed `<Y>`…") better than one offset; decide when implementing gap 3.
3. **If oxc ever publishes a single-threaded non-WASI WASM build,** does the arithmetic change? Only the runtime wall moves — §§4–5 still hold, so the answer stays no for the render path.
4. **Benchmark duty:** if parse cost is ever suspected on the preview path, measure the hand scanner first — no oxc comparison in this note replaces a profile.

## Sources (primary only; all read 2026-09-22 unless dated)

- oxc — Parser usage page (features, install, `parseSync`/`parse`, esrap printing, "comments are not printed" INFO): https://oxc.rs/docs/guide/usage/parser
- oxc — `napi/parser` README (API example, ESTree conformance claim, options list, ESM info, fast mode): https://github.com/oxc-project/oxc/blob/main/napi/parser/README.md (raw fetched 2026-09-22)
- oxc — `napi/parser/src-js/index.d.ts` (`ParseResult`, `ParserOptions`, `OxcError`, `Comment`, `Span`, `parse`/`parseSync` docblocks incl. the 3–20× deserialization note): https://github.com/oxc-project/oxc/blob/main/napi/parser/src-js/index.d.ts (raw fetched 2026-09-22)
- oxc — `napi/parser/src-js/index.js` (native `./bindings.js` default path): https://github.com/oxc-project/oxc/blob/main/napi/parser/src-js/index.js (raw fetched 2026-09-22)
- oxc — `napi/parser/src-js/wasm.js` (re-exports `@oxc-parser/binding-wasm32-wasi`): https://github.com/oxc-project/oxc/blob/main/napi/parser/src-js/wasm.js (raw fetched 2026-09-22)
- oxc — `napi/parser/src-js/wasi-worker.mjs` (`node:fs`/`node:module`/`node:path`/`node:wasi`/`node:worker_threads` requirements): https://github.com/oxc-project/oxc/blob/main/napi/parser/src-js/wasi-worker.mjs (raw fetched 2026-09-22)
- oxc — `napi/parser/test/parse.test.ts` (errors alongside program, span shape, comment capture, `range` opt-in, UTF-16 spans): https://github.com/oxc-project/oxc/blob/main/napi/parser/test/parse.test.ts (raw fetched 2026-09-22)
- oxc — Dealing with Errors ("Most JavaScript parsers out there are partially recoverable, so we'll do the same"): https://oxc.rs/docs/learn/parser_in_rust/errors.html
- oxc — Parser guide intro (frontend phases; performance stance): https://oxc.rs/docs/learn/parser_in_rust/intro.html
- npm registry — `oxc-parser@0.151.0` metadata (`dist.unpackedSize: 1425623`, `browser: src-js/wasm.js`, napi targets incl. `wasm32-wasip1-threads`, `optionalDependencies` platform bindings): https://registry.npmjs.org/oxc-parser/latest
- npm registry — `@oxc-parser/binding-linux-x64-gnu@0.151.0` (`main: parser.linux-x64-gnu.node`, `unpackedSize: 2122208`): https://registry.npmjs.org/@oxc-parser/binding-linux-x64-gnu/latest
- npm registry — `@oxc-parser/binding-wasm32-wasi@0.151.0` (`unpackedSize: 2068823`, emnapi/`@napi-rs/wasm-runtime` deps): https://registry.npmjs.org/@oxc-parser/binding-wasm32-wasi/latest
- npm registry — `@oxc-project/types@0.151.0` (`unpackedSize: 44596`): https://registry.npmjs.org/@oxc-project/types/latest
- Babel — `packages/babel-types/src/definitions/jsx.ts` (JSXElement/Fragment/Attribute/SpreadAttribute/ExpressionContainer/Text/MemberExpression inventory): https://github.com/babel/babel/blob/main/packages/babel-types/src/definitions/jsx.ts (raw fetched 2026-09-22)
- React — Writing Markup with JSX (single-root rule, fragments, close-all-tags): https://react.dev/learn/writing-markup-with-jsx
- Cloudflare — `cloudflare/workerd` discussion #1905 ("Node.js native add-ons are likely never to be supported by workers"): https://github.com/cloudflare/workerd/discussions/1905
- Cloudflare — `cloudflare/workers-sdk` issue #4913 (`No loader is configured for ".node" files`, closed as no plans to support): https://github.com/cloudflare/workers-sdk/issues/4913
- Cloudflare — Node.js compatibility (supported list; `node:wasi`/`node:worker_threads` non-functional stubs; `nodejs_compat` default from 2026-08-04): https://developers.cloudflare.com/workers/runtime-apis/nodejs/ (updated 2026-08-12)
- Cloudflare — WebAssembly (instantiate-only, no threading/Web Workers, experimental partial WASI, size→startup warning): https://developers.cloudflare.com/workers/runtime-apis/webassembly/ (updated 2026-04-23)
- Cloudflare — Module registry rewrite (ESM/CJS/Wasm module types; 64 MiB on all plans): https://blog.cloudflare.com/workers-module-registry-nodejs/ (2026-09-09)
- Repo-local precedent — `docs/research/2026-09-22-jsx-dsl-parsing-in-astro.md` (the verdict under test: harden the hand parser; five gaps; Lezer as the only sanctioned fallback)
- Repo-local precedent — `docs/research/2026-09-22-elegant-block-cms-rearchitecture.md` (§1.1 item 3 parity-by-construction; §3.4 editor lint/autocomplete plan; Phase 0/4 ordering)
- Attempted but unusable (recorded, not cited for claims): `https://oxc-project.github.io/docs/learn/parser_in_rust.html` and `…/docs/usage/parser` (both 404 on fetch 2026-09-22 — docs moved to `oxc.rs`; the moved pages are cited instead).

*Repo versions at read time (from `package.json`): `astro@^7.3.2`, `@astrojs/cloudflare@^14.3.1`, `@astrojs/mdx@^8.0.1`, `codemirror@^6.0.2` plus `@codemirror/state@^6.7.5` plus `@codemirror/lang-markdown@^6.5.2`, `valibot@^1.5.0`, `wrangler@^4.132.0`, compat date `2026-09-16`. oxc versions read: `oxc-parser@0.151.0`, `@oxc-parser/binding-linux-x64-gnu@0.151.0`, `@oxc-parser/binding-wasm32-wasi@0.151.0`, `@oxc-project/types@0.151.0`.*
