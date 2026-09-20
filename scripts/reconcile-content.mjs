#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Simple .env parser
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

function parseFrontmatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: fileContent };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();

      // Basic YAML scalar parsing
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (/^['"].*['"]$/.test(val)) val = val.slice(1, -1);
      else if (/^\d+$/.test(val)) val = Number(val);

      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

async function main() {
  const isRemote = process.argv.includes("--remote");
  const targetFlag = isRemote ? "--remote" : "--local";

  console.log(`\n==========================================`);
  console.log(`   D1 Content Reconciler (${isRemote ? "REMOTE D1" : "LOCAL D1"})   `);
  console.log(`==========================================\n`);

  const blogDir = path.join(process.cwd(), "src", "content", "blog");
  if (!fs.existsSync(blogDir)) {
    console.error("Content directory not found:", blogDir);
    process.exit(1);
  }

  const entries = fs.readdirSync(blogDir, { withFileTypes: true });
  const articles = [];

  for (const entry of entries) {
    let slug = "";
    let filePath = "";

    if (entry.isDirectory()) {
      slug = entry.name;
      const mdxPath = path.join(blogDir, slug, "index.mdx");
      const mdPath = path.join(blogDir, slug, "index.md");
      if (fs.existsSync(mdxPath)) filePath = mdxPath;
      else if (fs.existsSync(mdPath)) filePath = mdPath;
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))) {
      slug = entry.name.replace(/\.(md|mdx)$/, "");
      filePath = path.join(blogDir, entry.name);
    }

    if (filePath && slug) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(raw);
      articles.push({ slug, frontmatter, body });
    }
  }

  console.log(`Found ${articles.length} article(s) in src/content/blog:\n` + articles.map(a => `  - ${a.slug} ("${a.frontmatter.title || a.slug}")`).join("\n"));

  let combinedSql = "";
  const now = new Date().toISOString();

  for (const article of articles) {
    const fm = article.frontmatter;
    const id = crypto.randomUUID();
    const slug = article.slug.replace(/'/g, "''");
    const title = (fm.title || article.slug).replace(/'/g, "''");
    const description = (fm.description || "").replace(/'/g, "''");
    const category = (fm.category || "General").replace(/'/g, "''");
    const tags = JSON.stringify(Array.isArray(fm.tags) ? fm.tags : []);
    const author = (fm.author || "jeflopo").replace(/'/g, "''");
    const featuredImage = (fm.heroImage || fm.featuredImage || "").replace(/'/g, "''");
    const contentMdx = article.body.replace(/'/g, "''");
    const status = fm.draft ? "draft" : "published";
    const template = (fm.template || "default").replace(/'/g, "''");
    const defaultWidth = (fm.defaultWidth || "60rem").replace(/'/g, "''");
    const wideWidth = (fm.wideWidth || "70rem").replace(/'/g, "''");
    const pubDate = (fm.pubDate ? new Date(fm.pubDate).toISOString() : now);

    combinedSql += `
INSERT INTO posts (
  id, slug, title, description, category, tags, author, featured_image, content_mdx,
  status, template, default_width, wide_width, pub_date, created_at, updated_at
) VALUES (
  '${id}', '${slug}', '${title}', '${description}', '${category}', '${tags}', '${author}',
  '${featuredImage}', '${contentMdx}', '${status}', '${template}', '${defaultWidth}', '${wideWidth}',
  '${pubDate}', '${now}', '${now}'
) ON CONFLICT(slug) DO UPDATE SET
  title = '${title}',
  description = '${description}',
  category = '${category}',
  tags = '${tags}',
  author = '${author}',
  featured_image = '${featuredImage}',
  content_mdx = '${contentMdx}',
  status = '${status}',
  template = '${template}',
  default_width = '${defaultWidth}',
  wide_width = '${wideWidth}',
  pub_date = '${pubDate}',
  updated_at = '${now}';
`;
  }

  const tempSqlFile = path.join(process.cwd(), "scripts", `_temp_reconcile_${Date.now()}.sql`);
  fs.writeFileSync(tempSqlFile, combinedSql, "utf-8");

  try {
    console.log(`\n[+] Reconciling articles into ${targetFlag} D1 database...`);
    const envVars = {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_D1_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN,
    };

    execSync(`npx wrangler d1 execute blog-astro ${targetFlag} --file="${tempSqlFile}"`, {
      stdio: "inherit",
      encoding: "utf-8",
      env: envVars,
    });

    console.log("\n[✓] Successfully reconciled all articles in D1 database!\n");
  } catch (err) {
    console.error("\n[!] Failed to execute reconciliation in D1:", err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }
}

main().catch(console.error);
