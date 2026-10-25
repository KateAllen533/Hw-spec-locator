import { existsSync, readFileSync, readdirSync, rmSync, statSync, chmodSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..");
const dist = path.join(root, "dist");
const maxBytes = 256 * 1024;

function modulePath(id) {
  return id.replaceAll("\0", "").split("?")[0];
}

function packageKey(id) {
  const marker = "/node_modules/";
  const at = id.lastIndexOf(marker);
  const rest = id.slice(at + marker.length);
  const parts = rest.split("/");
  return parts[0].startsWith("@") ? `${parts[0]}-${parts[1]}` : parts[0];
}

function vendorChunk(id) {
  const norm = modulePath(id).split("\\").join("/");
  if (norm.includes("/node_modules/zod/")) {
    let rel = norm.split("/node_modules/zod/")[1].replace(/\.(js|cjs|mjs)$/, "");
    if (rel === "v4/core/util" || rel === "v4/core/core") rel = "v4/core/runtime";
    return `vendor/zod/${rel}`;
  }
  const pkg = packageKey(norm).replace("@", "");
  return `vendor/${pkg}`;
}

function shimAjv() {
  const ajv = path.join(root, "src", "shims", "ajv.js");
  const formats = path.join(root, "src", "shims", "ajv-formats.js");
  return {
    name: "shim-ajv",
    resolveId(source) {
      if (source === "ajv" || source.startsWith("ajv/")) return ajv;
      if (source === "ajv-formats" || source.startsWith("ajv-formats/")) return formats;
      return null;
    },
  };
}

function manualChunks(id) {
  const norm = modulePath(id).split("\\").join("/");
  if (norm.includes("/node_modules/")) return vendorChunk(id);
  if (norm.includes("/mcp-server/src/") && !norm.endsWith("/src/index.ts")) {
    return `app/${norm.split("/mcp-server/src/")[1].replace(/\.(ts|js|mjs|cjs)$/, "")}`;
  }
  return undefined;
}

rmSync(dist, { recursive: true, force: true });

const bundle = await rollup({
  input: path.join(root, "src", "index.ts"),
  plugins: [
    shimAjv(),
    resolveTypeScript(),
    nodeResolve({ preferBuiltins: true, exportConditions: ["node", "import", "default"] }),
    commonjs(),
    json(),
    esbuildTransform(),
  ],
  onwarn(warning, warn) {
    if (warning.code === "CIRCULAR_DEPENDENCY" && warning.message.includes("node_modules")) return;
    if (warning.code === "INVALID_ANNOTATION") return;
    if (typeof warning.message === "string" && warning.message.includes("empty chunk")) return;
    warn(warning);
  },
});

await bundle.write({
  dir: dist,
  format: "es",
  entryFileNames: "index.js",
  chunkFileNames: "[name].js",
  manualChunks,
  generatedCode: { constBindings: true },
});
await bundle.close();
chmodSync(path.join(dist, "index.js"), 0o755);
pruneUnreachable(dist);

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full);
    else files.push(full);
  }
}
const tooBig = [];
let largest = { size: 0, rel: "" };
function note(file) {
  if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}.git${path.sep}`)) return;
  const size = statSync(file).size;
  const rel = path.relative(repoRoot, file);
  if (size > largest.size) largest = { size, rel };
  if (size > maxBytes) tooBig.push(`${rel} is ${size} bytes`);
}
walk(dist);
for (const file of files) note(file);
function walkRepo(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === ".git") continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walkRepo(full);
    else note(full);
  }
}
walkRepo(repoRoot);
console.log(`largest ${largest.size} ${largest.rel}`);
if (tooBig.length > 0) {
  console.error(tooBig.join("\n"));
  process.exit(1);
}
console.log(`every shipped file is <= ${maxBytes} bytes`);

function pruneUnreachable(dir) {
  const entry = path.join(dir, "index.js");
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g)) {
      const spec = match[1] || match[2];
      const resolved = path.resolve(path.dirname(file), spec);
      queue.push(resolved);
    }
  }
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, name.name);
      if (name.isDirectory()) pending.push(full);
      else if (full.endsWith(".js") && !seen.has(full)) unlinkSync(full);
    }
  }
}

function resolveTypeScript() {
  return {
    name: "resolve-typescript",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
      const candidate = path.resolve(path.dirname(importer), source.slice(0, -3) + ".ts");
      return existsSync(candidate) ? candidate : null;
    },
  };
}

function esbuildTransform() {
  return {
    name: "esbuild-ts",
    async transform(code, id) {
      if (!id.endsWith(".ts")) return null;
      const esbuild = await import("esbuild");
      const result = await esbuild.transform(code, {
        loader: "ts",
        target: "node20",
        format: "esm",
        sourcefile: id,
      });
      return { code: result.code };
    },
  };
}
