#!/usr/bin/env node
// Verifica que el repositorio se puede publicar: JSON válido, manifiestos
// coherentes, y toda skill con el frontmatter que Claude Code necesita.
// Falla el build; un marketplace roto se instala y no carga nada.
//
//   node scripts/validate.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const errors = [];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const marketplacePath = ".claude-plugin/marketplace.json";
let marketplace;

try {
  marketplace = readJson(marketplacePath);
} catch (error) {
  console.error(`${marketplacePath}: JSON inválido — ${error.message}`);
  process.exit(1);
}

const pluginNames = readdirSync("plugins", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const declared = new Set(marketplace.plugins.map((plugin) => plugin.name));
for (const name of pluginNames) {
  if (!declared.has(name)) errors.push(`plugins/${name} no está declarado en el marketplace`);
}
for (const name of declared) {
  if (!pluginNames.includes(name)) errors.push(`el marketplace declara '${name}', que no existe`);
}

// Las versiones deben ir todas a una: el zip de un plugin dice qué versión es,
// y si miente, nadie puede saber qué tiene instalado.
const versions = new Map([[marketplacePath, marketplace.version]]);
for (const plugin of marketplace.plugins) {
  versions.set(`marketplace.plugins[${plugin.name}]`, plugin.version);
}

const skillNames = new Map();

for (const name of pluginNames) {
  const manifestPath = join("plugins", name, ".claude-plugin", "plugin.json");

  if (!existsSync(manifestPath)) {
    errors.push(`plugins/${name}: falta .claude-plugin/plugin.json`);
    continue;
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    errors.push(`${manifestPath}: JSON inválido — ${error.message}`);
    continue;
  }

  if (manifest.name !== name) {
    errors.push(`${manifestPath}: name '${manifest.name}' != carpeta '${name}'`);
  }
  versions.set(manifestPath, manifest.version);

  const skillsDir = join("plugins", name, "skills");
  if (!existsSync(skillsDir)) continue;

  for (const skill of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;

    const skillPath = join(skillsDir, skill.name, "SKILL.md");
    if (!existsSync(skillPath)) {
      errors.push(`${join(skillsDir, skill.name)}: falta SKILL.md`);
      continue;
    }

    const content = readFileSync(skillPath, "utf8");
    if (!content.startsWith("---\n")) {
      errors.push(`${skillPath}: sin frontmatter`);
      continue;
    }

    const frontmatter = content.slice(4, content.indexOf("\n---", 4));
    const declaredName = frontmatter.match(/^name:\s*(\S+)/m)?.[1];
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1];

    // Sin `name`, el nombre de invocación cambia con cada actualización.
    if (!declaredName) errors.push(`${skillPath}: falta 'name' en el frontmatter`);
    else if (declaredName !== skill.name) {
      errors.push(`${skillPath}: name '${declaredName}' != carpeta '${skill.name}'`);
    }

    // La description es lo único que Claude lee para decidir si carga la skill.
    if (!description) errors.push(`${skillPath}: falta 'description' en el frontmatter`);
    else if (description.length < 40) {
      errors.push(`${skillPath}: description demasiado corta para decidir cuándo cargarla`);
    }

    if (declaredName) {
      if (skillNames.has(declaredName)) {
        errors.push(`skill duplicada '${declaredName}': ${skillNames.get(declaredName)} y ${skillPath}`);
      }
      skillNames.set(declaredName, skillPath);
    }
  }
}

const distinct = new Set(versions.values());
if (distinct.size > 1) {
  errors.push(`versiones descoordinadas: ${[...versions].map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

if (errors.length) {
  console.error(`validate: ${errors.length} error(es)\n`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log(
  `validate: ok — ${pluginNames.length} plugins, ${skillNames.size} skills, v${marketplace.version}`,
);
