# Bare-Text Prose and Elimination of Markdown in Editor

The CodeMirror editorial workspace removes markdown parsing in favor of bare-text prose for paragraphs, semantic marks for inline formatting, and declarative JSX tags for custom blocks — replacing `@codemirror/lang-markdown` with tag/attribute syntax highlighting via `@codemirror/lang-html`.

## Status
Accepted

## Context
ADR-0010 introduced the JSX Block DSL to replace Markdown across storage, validation, and rendering. However, the browser CodeMirror editor still imported `@codemirror/lang-markdown`. This caused markdown characters (`#`, `*`, `_`, `[link](url)`) to be visually formatted as headings and emphasis in the editor, even though the JSX DSL parser treats them as literal characters. Editors were confused when typing `# Title` produced a plain paragraph in the rendered output rather than a heading.

## Decision
1. Eliminate `@codemirror/lang-markdown` from the editor bundle. Replace it with `@codemirror/lang-html` with `matchClosingTags: true` and `autoCloseTags: true`.
2. Editorial authoring rule:
   - **Paragraphs**: Bare prose text. Blank lines (`\n\n`) naturally flush into `<Paragraph>` block nodes via the DSL parser. No tags or markdown symbols are required.
   - **Inline Formatting**: Semantic mark tags (`<Bold>`, `<Italic>`, `<Code>`, `<Link href="...">`) inserted via the formatting toolbar or typed directly.
   - **Custom & Dynamic Blocks**: Explicit JSX block tags (`<Heading level={2}>`, `<Callout variant="tip">`, `<PricingTable tier="pro">`, `<LivePoll pollId="1" />`) inserted from the Blocks drawer or typed.
3. Markdown characters (`#`, `*`, `_`, backticks) are treated as literal characters everywhere in prose and have no formatting side effects.

## Considered Options
- **Keeping markdown syntax highlighting with a transformer**: Rejected; creates dual syntax mental overhead and ambiguity between Markdown shortcuts and JSX block props.
- **Rich text WYSIWYG editor (e.g. ProseMirror / TipTap)**: Deferred; CodeMirror with tag highlighting preserves clean text-level diffs, git bundle portability, and deterministic JSX DSL parity.

## Consequences
- The editor appearance perfectly matches the AST and Document Renderer output: what you type is exactly what is stored and rendered.
- Authors write natural prose without memorizing markdown conventions.
- Custom block tags and attributes receive clean, readable syntax highlighting.
