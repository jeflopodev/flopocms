# Automated Editorial Branching and Preview PRs

To provide a zero-friction editorial experience for both editors (`jeflopo` and `aflopo`) without running a database-driven CMS, article drafting is managed via an automated CLI scaffolder (`pnpm new-article`). The tool creates an editor-namespaced Git branch (`<editor>/<slug>`), initializes the article bundle, pushes to GitHub, and immediately opens a draft pull request via the `gh` CLI to trigger a Cloudflare Preview Deployment.

## Considered Options

- **Manual Git branch and PR creation**: Rejected due to unnecessary friction and potential for inconsistent branch naming or missed draft flags.
- **Background GitHub Action on push**: Rejected in favor of local CLI orchestration, which provides instant terminal feedback, confirms the target slug, and outputs the Cloudflare PR link immediately to the editor.

## Consequences

Editors must have the GitHub CLI (`gh`) authenticated locally. Articles remain private on draft PRs and only deploy to the production domain when `draft: false` is set and the PR is merged into `main`.
