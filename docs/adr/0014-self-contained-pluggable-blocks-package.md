# Self-Contained Pluggable Blocks Package

Blocks live in `packages/blocks` with zero imports outside it; the registry manifest is the only hardcoded list, and the editor toolbar renders from block-declared entries — so removing a block directory plus its manifest lines removes the block everywhere, with content still using its tag refused at save naming it.

## Status
Accepted

## Context
Blocks were CMS-owned source with hardcoded references in three places: the registry manifest, the editor toolbar snippets, and the editor page buttons. Deleting a block directory left dead buttons inserting unpublishable DSL.

## Decision
1. `packages/blocks` owns block dirs, the DSL, marks, insertion, registry, toolbar model, and the dependency-free asset rules; it imports nothing outside itself (CMS satisfies its structural article-source interface without either package importing the other).
2. `BlockDefinition.toolbar` declares a block's buttons; `getToolbarActions()` composes marks plus registered entries by explicit order, and the site editor page renders groups from that list — no literal `data-tool` in markup.
3. The manifest comment states the removal contract: delete the directory, delete its manifest lines, prune set-asserting tests; drawer, toolbar, validation, rendering, styles, and JSON-LD follow.

## Considered Options
- One package per block: rejected, N-package overhead for twelve blocks with no cross-block isolation need; the directory is already the removal unit.
- Keep blocks in cms: rejected, block code would ride every CMS change and the repo split needs the boundary now.

## Consequences
- `cms` and `sites/*` depend on `blocks`; removing e.g. quote deletes `quote/`, two manifest lines, and its buttons vanish from the toolbar while existing `<Quote>` content fails loud at save.
- Toolbar order is explicit per entry; a new block picks an order and a group instead of landing wherever registration order puts it.
