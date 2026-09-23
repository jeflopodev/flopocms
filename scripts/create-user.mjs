#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { execSync } from "node:child_process";
// The credential policy lives with Editor Accounts; this script used to carry a second
// copy of PBKDF2. Node strips the types itself, so the module is importable as written —
// and only `auth.ts`, which imports nothing, is reached from here.
import { generateSalt, hashPassword } from "../src/lib/auth.ts";

// Simple .env parser to avoid extra dependencies
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

async function main() {
  const args = process.argv.slice(2);
  const isRemote = args.includes("--remote");
  const targetFlag = isRemote ? "--remote" : "--local";

  let username = "";
  let password = "";

  const userIdx = args.indexOf("--username");
  if (userIdx !== -1 && args[userIdx + 1]) {
    username = args[userIdx + 1].trim().toLowerCase();
  }

  const passIdx = args.indexOf("--password");
  if (passIdx !== -1 && args[passIdx + 1]) {
    password = args[passIdx + 1].trim();
  }

  if (!username || !password) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`\n==========================================`);
    console.log(`   Admin User Creator (${isRemote ? "REMOTE D1" : "LOCAL D1"})   `);
    console.log(`==========================================\n`);

    if (!username) {
      username = (await rl.question("Enter username (e.g. jeflopo): ")).trim().toLowerCase();
    }
    if (!password) {
      password = (await rl.question("Enter password: ")).trim();
    }
    rl.close();
  }

  if (!username || !password) {
    console.error("Error: Username and password are required.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Error: Password must be at least 8 characters long.");
    process.exit(1);
  }

  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  const id = crypto.randomUUID();

  const escapedUsername = username.replace(/'/g, "''");
  const sql = `INSERT INTO users (id, username, password_hash, salt) VALUES ('${id}', '${escapedUsername}', '${hash}', '${salt}') ON CONFLICT(username) DO UPDATE SET password_hash = '${hash}', salt = '${salt}';\n`;

  const tempSqlFile = path.join(process.cwd(), "scripts", `_temp_user_${Date.now()}.sql`);
  fs.writeFileSync(tempSqlFile, sql, "utf-8");

  try {
    console.log(`\n[+] Provisioning user '${username}' in ${isRemote ? "REMOTE" : "LOCAL"} D1 database...`);
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

    console.log(`\n[✓] User '${username}' successfully configured!\n`);
  } catch (err) {
    console.error("\n[!] Failed to execute user provisioning in D1:", err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }
}

main().catch(console.error);
