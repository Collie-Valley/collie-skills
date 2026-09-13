#!/usr/bin/env node
// Empaqueta cada plugin en su propio zip, más uno con el marketplace completo.
// Los zips se adjuntan al release de GitHub para instalar sin el marketplace.
//
//   node scripts/build-packages.mjs <version>
//
// Produce en dist/:
//   collie-<plugin>-<version>.zip   un plugin suelto, con sus skills
//   collie-skills-<version>.zip     el marketplace entero

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error(`build-packages: versión inválida: ${version ?? "(ninguna)"}`);
  process.exit(1);
}

const dist = "dist";
const staging = join(dist, ".staging");
rmSync(dist, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

// `zip -r` desde el directorio padre, para que las rutas del archivo sean
// relativas y no incluyan dist/.staging/.
const zip = (cwd, archive, entries) =>
  execFileSync("zip", ["-qr", archive, ...entries], { cwd, stdio: "inherit" });

const pluginNames = readdirSync("plugins", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const countSkills = (pluginName) => {
  const skillsDir = join("plugins", pluginName, "skills");
  try {
    return readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
};

// Un zip por plugin: se descomprime en ~/.claude/plugins/ y queda instalado.
for (const name of pluginNames) {
  const root = join(staging, name);
  mkdirSync(root, { recursive: true });
  cpSync(join("plugins", name), join(root, name), { recursive: true });

  const readme = `# ${name}

Plugin de [collie-skills](https://github.com/Collie-Valley/collie-skills) v${version}.
Contiene ${countSkills(name)} skills.

## Instalar desde este zip

\`\`\`bash
unzip collie-${name}-${version}.zip -d ~/.claude/plugins/
\`\`\`

Reinicia Claude Code para que las cargue.

## Instalar desde el marketplace (recomendado)

\`\`\`
/plugin marketplace add Collie-Valley/collie-skills
/plugin install ${name}@collie-skills
\`\`\`

Así se actualizan solas con \`/plugin marketplace update collie-skills\`.
`;
  writeFileSync(join(root, name, "README.md"), readme);
  zip(root, join("..", "..", `collie-${name}-${version}.zip`), [name]);
  console.log(`  collie-${name}-${version}.zip (${countSkills(name)} skills)`);
}

// El marketplace completo: se clona o se descomprime y se añade como fuente local.
const full = join(staging, "full", "collie-skills");
mkdirSync(full, { recursive: true });
for (const entry of [".claude-plugin", "plugins", "README.md"]) {
  cpSync(entry, join(full, entry), { recursive: true });
}
zip(join(staging, "full"), join("..", "..", `collie-skills-${version}.zip`), ["collie-skills"]);

rmSync(staging, { recursive: true, force: true });

const totalSkills = pluginNames.reduce((sum, name) => sum + countSkills(name), 0);
console.log(`  collie-skills-${version}.zip (marketplace completo)`);
console.log(`build-packages: ${pluginNames.length} plugins, ${totalSkills} skills, v${version}`);
