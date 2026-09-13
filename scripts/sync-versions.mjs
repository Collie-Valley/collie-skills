#!/usr/bin/env node
// Propaga la versión que decide semantic-release a marketplace.json y a cada
// plugin.json. Sin esto, los manifiestos se quedarían en 0.1.0 para siempre.
//
//   node scripts/sync-versions.mjs <version>

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error(`sync-versions: versión inválida: ${version ?? "(ninguna)"}`);
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

const marketplacePath = ".claude-plugin/marketplace.json";
const marketplace = readJson(marketplacePath);
const pluginNames = readdirSync("plugins", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// El marketplace declara los plugins; el disco los tiene. Si divergen, el
// release publicaría un catálogo que miente.
const declared = new Set(marketplace.plugins.map((plugin) => plugin.name));
const onDisk = new Set(pluginNames);
const missing = [...onDisk].filter((name) => !declared.has(name));
const extra = [...declared].filter((name) => !onDisk.has(name));

if (missing.length || extra.length) {
  console.error("sync-versions: marketplace.json y plugins/ no coinciden");
  if (missing.length) console.error(`  sin declarar en el marketplace: ${missing.join(", ")}`);
  if (extra.length) console.error(`  declarados pero ausentes del disco: ${extra.join(", ")}`);
  process.exit(1);
}

marketplace.version = version;
for (const plugin of marketplace.plugins) plugin.version = version;
writeJson(marketplacePath, marketplace);

for (const name of pluginNames) {
  const path = join("plugins", name, ".claude-plugin", "plugin.json");
  const plugin = readJson(path);
  plugin.version = version;
  writeJson(path, plugin);
}

console.log(`sync-versions: ${version} en marketplace.json y ${pluginNames.length} plugin.json`);
