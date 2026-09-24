import { defineConfig } from "drizzle-kit";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_D1_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_DATABASE_ID || process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_TOKEN;

const isD1Remote = Boolean(accountId && databaseId && token);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations/drizzle",
  dialect: "sqlite",
  ...(isD1Remote
    ? {
        driver: "d1-http",
        dbCredentials: {
          accountId: accountId!,
          databaseId: databaseId!,
          token: token!,
        },
      }
    : {}),
});

