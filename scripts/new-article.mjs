#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import readline from "node:readline";

const VALID_EDITORS = ["jeflopo", "aflopo"];

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: "pipe", encoding: "utf-8", ...options }).trim();
  } catch (error) {
    if (options.allowFailure) return null;
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isNoPr = args.includes("--no-pr") || args.includes("--local");

  // Filter out flag options to find raw title
  const positionalArgs = args.filter((arg) => !arg.startsWith("--"));

  let title = positionalArgs.join(" ").trim();
  let editor = null;

  const editorFlag = args.find((a) => a.startsWith("--editor="));
  if (editorFlag) {
    editor = editorFlag.split("=")[1]?.trim().toLowerCase();
  }

  console.log("\n==========================================");
  console.log("   Blog Article Scaffolder (Cloudflare)   ");
  console.log("==========================================\n");

  if (!title) {
    title = await prompt("Enter article title: ");
  }

  if (!title) {
    console.error("Error: Article title is required.");
    process.exit(1);
  }

  if (!editor || !VALID_EDITORS.includes(editor)) {
    // Attempt git config lookup
    const gitUser = run("git config user.name", { allowFailure: true })?.toLowerCase() || "";
    const defaultEditor = gitUser.includes("aflopo") ? "aflopo" : "jeflopo";

    const editorInput = await prompt(
      `Select editor (${VALID_EDITORS.join("/")}) [default: ${defaultEditor}]: `
    );
    editor = editorInput ? editorInput.toLowerCase() : defaultEditor;
  }

  if (!VALID_EDITORS.includes(editor)) {
    console.error(`Error: Invalid editor "${editor}". Allowed editors: ${VALID_EDITORS.join(", ")}`);
    process.exit(1);
  }

  const slug = slugify(title);
  const branchName = `${editor}/${slug}`;
  const today = new Date().toISOString().split("T")[0];
  const bundleDir = path.join(process.cwd(), "src", "content", "blog", slug);
  const mdxFile = path.join(bundleDir, "index.mdx");

  console.log(`\n  Target Title  : ${title}`);
  console.log(`  Editor        : ${editor}`);
  console.log(`  Slug          : ${slug}`);
  console.log(`  Branch        : ${branchName}`);
  console.log(`  Bundle Path   : src/content/blog/${slug}/\n`);

  if (fs.existsSync(bundleDir)) {
    console.error(`Error: Article directory already exists at ${bundleDir}`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log("[Dry Run] Would execute:");
    console.log(`  - git checkout -b ${branchName}`);
    console.log(`  - Create ${mdxFile}`);
    console.log(`  - git add ${bundleDir}`);
    console.log(`  - git commit -m "feat(blog): scaffold ${slug} by @${editor}"`);
    if (!isNoPr) {
      console.log(`  - git push -u origin ${branchName}`);
      console.log(`  - gh pr create --draft --title "Draft: ${title}" ...`);
    }
    console.log("\nDry run complete. No files or branches modified.");
    return;
  }

  // 1. Create Article Bundle
  fs.mkdirSync(bundleDir, { recursive: true });

  const starterMdx = `---
title: '${title.replace(/'/g, "\\'")}'
description: 'Add a concise summary describing this article...'
pubDate: '${today}'
author: '${editor}'
draft: true
---

import AmazonProduct from '#/components/amazon-product.astro';
import YouTube from '#/components/youtube.astro';

Write your article content here. You can use standard Markdown, co-locate images in this folder, and embed components.

## Section Header

<YouTube id="dQw4w9WgXcQ" title="Overview Video" stretch="wide" />

Prose paragraphs flow inside the default readable container. Use the \`stretch\` prop (\`"wide"\`, \`"full"\`, or custom CSS length) to break out of standard reading margins.
`;

  fs.writeFileSync(mdxFile, starterMdx, "utf-8");
  console.log(`[+] Created Article Bundle: ${path.relative(process.cwd(), mdxFile)}`);

  // 2. Git Branch & Commit
  try {
    console.log(`[+] Creating branch "${branchName}"...`);
    run(`git checkout -b ${branchName}`);

    console.log(`[+] Committing initial bundle...`);
    run(`git add src/content/blog/${slug}`);
    run(`git commit -m "feat(blog): scaffold ${slug} by @${editor}"`);
  } catch (err) {
    console.error(`Git error: ${err.message}`);
    process.exit(1);
  }

  // 3. Push and Draft PR
  if (isNoPr) {
    console.log(`\n[i] Skipped remote push and PR creation (--no-pr flag set).`);
    console.log(`    When ready, run: git push -u origin ${branchName} && gh pr create --draft`);
    return;
  }

  console.log(`[+] Pushing branch to origin...`);
  const pushResult = run(`git push -u origin ${branchName}`, { allowFailure: true });
  if (pushResult === null) {
    console.warn(`[!] Remote push failed (remote origin may not be configured or reachable).`);
    console.log(`    Your local branch and bundle are ready at: ${branchName}`);
    return;
  }

  console.log(`[+] Creating draft Pull Request via gh CLI...`);
  const prBody = `## Editorial Draft: ${title}

- **Author**: @${editor}
- **Slug**: \`${slug}\`
- **Bundle**: \`src/content/blog/${slug}/index.mdx\`
- **Status**: Work in Progress (\`draft: true\`)

Cloudflare will generate a live **Preview Deployment** comment below shortly.
When this article is finalized, change \`draft: false\` in the frontmatter and merge this PR to publish to production.`;

  const prCmd = `gh pr create --draft --title "Draft: ${title.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"')}"`;
  const prResult = run(prCmd, { allowFailure: true });

  if (prResult) {
    console.log(`\n==========================================`);
    console.log(`  Draft PR created successfully!`);
    console.log(`  ${prResult}`);
    console.log(`  Cloudflare preview URL will appear in the PR.`);
    console.log(`==========================================\n`);
  } else {
    console.log(`[i] Could not run "gh pr create". You can open the PR manually on GitHub or run:`);
    console.log(`    gh pr create --draft --title "Draft: ${title}"`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
