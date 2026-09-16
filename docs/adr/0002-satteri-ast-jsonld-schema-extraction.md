# Sätteri AST Plugin for Component JSON-LD Schema Extraction

To allow editors to naturally embed structured data components (such as product cards or pros/cons tables) inside MDX without maintaining redundant frontmatter schemas or encountering SSR layout timing issues, a custom Sätteri AST processor plugin traverses the MDX syntax tree during compilation. The plugin extracts props from registered schema components and synthesizes a single, cohesive JSON-LD graph attached to the compiled article metadata for injection into the document `<head>`.

## Considered Options

- **Frontmatter-only schema declaration**: Rejected because it disconnects structured data definitions from the editorial flow in the MDX body and requires duplicate authoring by editors.
- **Runtime component store / Context**: Rejected because it relies on runtime evaluation passes that can introduce rendering race conditions between child components and layout `<head>`.
