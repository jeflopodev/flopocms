#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    256
  );

  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  const isRemote = process.argv.includes("--remote");
  const targetFlag = isRemote ? "--remote" : "--local";

  console.log(`\n==========================================`);
  console.log(`   D1 Database Seeder (${isRemote ? "REMOTE" : "LOCAL"})   `);
  console.log(`==========================================\n`);

  // Default editors
  const users = [
    { username: "jeflopo", password: "password123" },
    { username: "aflopo", password: "password123" },
  ];

  let combinedSql = "";

  // 1. Seed users
  for (const user of users) {
    const salt = generateSalt();
    const hash = await hashPassword(user.password, salt);
    const id = crypto.randomUUID();

    combinedSql += `INSERT INTO users (id, username, password_hash, salt) VALUES ('${id}', '${user.username}', '${hash}', '${salt}') ON CONFLICT(username) DO UPDATE SET password_hash = '${hash}', salt = '${salt}';\n`;
  }

  // 2. Seed initial sample post (demonstrating default and two-column templates)
  const now = new Date().toISOString();
  const samplePostId = crypto.randomUUID();
  const samplePostSlug = "welcome-to-the-new-blog";
  const sampleTitle = "Welcome to the Modernized Astro Blog";
  const sampleDesc = "Exploring the new Drizzle ORM, global assets pipeline, and isolated templates.";
  const sampleContent = `
This blog has been upgraded with cutting-edge capabilities:

<Callout variant="tip">
  Callouts now render with accessible rich alerts instead of legacy markdown quotes!
</Callout>

### Complex Lists Demonstration
<Ul list-style-type="disc">
  <li>First primary point</li>
  <Ol list-style-type="roman">
    <li>Nested Roman numeral step 1</li>
    <li>Nested Roman numeral step 2</li>
  </Ol>
  <li>Second primary point</li>
</Ul>

Enjoy authoring in the streamlined workspace!
`.trim();

  combinedSql += `INSERT INTO posts (id, slug, title, description, category, tags, author, featured_image, content_mdx, status, template, pub_date, created_at, updated_at)
VALUES ('${samplePostId}', '${samplePostSlug}', '${sampleTitle}', '${sampleDesc}', 'Astro', '["astro","drizzle","webdev"]', 'jeflopo', '', '${sampleContent.replace(/'/g, "''")}', 'published', 'two-column', '${now}', '${now}', '${now}')
ON CONFLICT(slug) DO UPDATE SET title = '${sampleTitle}', template = 'two-column', updated_at = '${now}';\n`;

  const tempSqlFile = path.join(process.cwd(), "scripts", "_temp_seed.sql");
  fs.writeFileSync(tempSqlFile, combinedSql, "utf-8");

  try {
    console.log(`[+] Executing seed batch against ${targetFlag}...`);
    execSync(`npx wrangler d1 execute blog-astro ${targetFlag} --file="${tempSqlFile}"`, {
      stdio: "inherit",
      encoding: "utf-8",
    });
    console.log("    Successfully seeded database!");
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }

  console.log(`\nSeeding complete! Default credentials: jeflopo / password123\n`);
}

main().catch(console.error);
