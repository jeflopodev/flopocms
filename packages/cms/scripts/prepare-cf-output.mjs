import { existsSync, mkdirSync, cpSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, extname, relative } from "node:path";
import configModule from "../cloudflare.config.ts";

const root = resolve(process.cwd());
const distServer = join(root, "dist", "server");
const distClient = join(root, "dist", "client");
const cfOutput = join(root, ".cloudflare", "output", "v0");

if (!existsSync(distServer)) {
  console.error("No dist/server directory found. Run astro build first.");
  process.exit(1);
}

// 1. Output directories
const workersDefaultDir = join(cfOutput, "workers", "default");
const bundleDir = join(workersDefaultDir, "bundle");
const assetsDir = join(workersDefaultDir, "assets");

mkdirSync(bundleDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

// 2. Root config.json
const rootConfig = {
  buildContext: {
    isPreview: false,
  },
};
writeFileSync(join(cfOutput, "config.json"), JSON.stringify(rootConfig, null, 2));

// 3. Copy server bundle to bundle/
cpSync(distServer, bundleDir, { recursive: true });

// 4. Copy client static assets to assets/
if (existsSync(distClient)) {
  cpSync(distClient, assetsDir, { recursive: true });
}

// 5. Scan modules for manifest
function scanModules(dir, baseDir = dir) {
  const modules = {};
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      Object.assign(modules, scanModules(fullPath, baseDir));
    } else if (stat.isFile()) {
      const ext = extname(item);
      const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");
      if (ext === ".js" || ext === ".mjs") {
        modules[relPath] = { type: "esm" };
      } else if (ext === ".map") {
        modules[relPath] = { type: "sourcemap" };
      }
    }
  }
  return modules;
}

const modules = scanModules(bundleDir);

// 6. Worker config from cloudflare.config.ts
const workerFromConfig = configModule.worker || {};

const workerConfig = {
  ...workerFromConfig,
  manifest: {
    type: "complete",
    mainModule: "entry.mjs",
    modules,
  },
};

writeFileSync(
  join(workersDefaultDir, "worker.config.json"),
  JSON.stringify(workerConfig, null, 2)
);

console.log("Cloudflare Build Output Specification (BOS) created successfully.");
