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
  console.log(`   D1 User Account Seeder (${isRemote ? "REMOTE" : "LOCAL"})   `);
  console.log(`==========================================\n`);

  // Default credentials (can be updated later in dashboard or via script)
  const users = [
    { username: "jeflopo", password: "password123" },
    { username: "aflopo", password: "password123" },
  ];

  let combinedSql = "";
  for (const user of users) {
    const salt = generateSalt();
    const hash = await hashPassword(user.password, salt);
    const id = crypto.randomUUID();

    combinedSql += `INSERT INTO users (id, username, password_hash, salt) VALUES ('${id}', '${user.username}', '${hash}', '${salt}') ON CONFLICT(username) DO UPDATE SET password_hash = '${hash}', salt = '${salt}';\n`;
  }

  const tempSqlFile = path.join(process.cwd(), "scripts", "_temp_seed.sql");
  fs.writeFileSync(tempSqlFile, combinedSql, "utf-8");

  try {
    console.log(`[+] Executing seed batch against ${targetFlag}...`);
    execSync(`npx wrangler d1 execute blog-astro ${targetFlag} --file="${tempSqlFile}"`, {
      stdio: "inherit",
      encoding: "utf-8",
    });
    console.log("    Successfully seeded user accounts!");
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }

  console.log(`\nSeeding complete! Default password is "password123". Change it once logged in.\n`);
}

main().catch(console.error);
