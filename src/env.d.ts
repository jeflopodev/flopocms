/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

interface Env {
  DB: import("@cloudflare/workers-types").D1Database;
  GITHUB_PAT?: string;
}

declare module "cloudflare:workers" {
  export const env: Env;
}

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      username: string;
    };
    cfContext?: any;
  }
}
