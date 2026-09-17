# Global MDX Components and Git-Sync Asset Pipeline

To eliminate manual import statement friction in the CodeMirror editor and maintain media co-location without exceeding Cloudflare D1 storage boundaries or requiring R2, custom components (`AmazonProduct`, `YouTube`, `Schema`) are auto-imported globally across all MDX documents. When images are uploaded through the editor, the Worker immediately commits them to the article's Git bundle path (`src/content/blog/<slug>/`) via the GitHub API, logging metadata in D1 and enabling Astro's build-time Sharp pipeline to generate responsive srcset variants.

## Considered Options

- **D1 BLOB storage for uploaded media**: Rejected because binary image chunks stress D1's 1MB–2MB row limits, consume worker memory, and require database queries on every image request.
- **In-file import hoisting**: Rejected in favor of ambient global MDX components, ensuring articles in the CodeMirror editor remain clean markdown and prose without redundant top-level script imports.
