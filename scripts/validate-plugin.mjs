import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "mcp-server", "package.json"));
const { Ajv } = require("ajv");

const schemas = [
  {
    url: "https://json.schemastore.org/claude-code-plugin-manifest.json",
    file: path.join(root, ".claude-plugin", "plugin.json"),
  },
  {
    url: "https://json.schemastore.org/claude-code-marketplace.json",
    file: path.join(root, ".claude-plugin", "marketplace.json"),
  },
];

const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
let failed = false;

for (const item of schemas) {
  const response = await fetch(item.url);
  if (!response.ok) {
    console.error(`Could not fetch ${item.url}: HTTP ${response.status}`);
    failed = true;
    continue;
  }
  const schema = await response.json();
  const validate = ajv.compile(schema);
  const data = JSON.parse(readFileSync(item.file, "utf8"));
  const ok = validate(data);
  const label = path.relative(root, item.file);
  if (!ok) {
    failed = true;
    console.error(`${label} failed ${item.url}`);
    console.error(JSON.stringify(validate.errors, null, 2));
  } else {
    console.log(`${label} matches ${item.url}`);
  }
}

const plugin = JSON.parse(readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8"));
const market = JSON.parse(readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
if (plugin.author?.name !== "Kaname Kanam" || market.owner?.name !== "Kaname Kanam") {
  console.error("Author or owner is not Kaname Kanam");
  failed = true;
}
if (plugin.license !== "MIT") {
  console.error("plugin.json license is not MIT");
  failed = true;
}
for (const entry of market.plugins ?? []) {
  if (entry.version) {
    console.error("Marketplace plugin entry must not repeat version (strict validate warning)");
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("plugin manifests ok");
