import { existsSync, rmSync, readdirSync, statSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const maxBytes = 1024 * 1024;

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
  const pkg = packageKey(modulePath(id)).replace("@", "");
  return `vendor/${pkg}`;
}

function manualChunks(id) {
  const norm = modulePath(id).split("\\").join("/");
  if (norm.includes("/node_modules/")) return vendorChunk(id);
  if (norm.includes("/mcp-server/src/") && !norm.endsWith("/src/index.ts")) {
    return `app/${norm.split("/mcp-server/src/")[1].replace(/\.ts$/, "")}`;
  }
  return undefined;
}

rmSync(dist, { recursive: true, force: true });

const bundle = await rollup({
  input: path.join(root, "src", "index.ts"),
  plugins: [
    resolveTypeScript(),
    nodeResolve({ preferBuiltins: true, exportConditions: ["node", "import", "default"] }),
    commonjs(),
    json(),
    esbuildTransform(),
  ],
  onwarn(warning, warn) {
    if (warning.code === "CIRCULAR_DEPENDENCY" && warning.message.includes("node_modules")) return;
    if (warning.code === "INVALID_ANNOTATION") return;
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

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(dist);
const tooBig = [];
for (const file of files) {
  const size = statSync(file).size;
  const rel = path.relative(root, file);
  console.log(`${String(size).padStart(8)} ${rel}`);
  if (size >= maxBytes) tooBig.push(`${rel} is ${size} bytes`);
}
if (tooBig.length > 0) {
  console.error(tooBig.join("\n"));
  process.exit(1);
}
console.log(`${files.length} files, each under 1 MiB`);

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
