import { createHash, createSign, createVerify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function exportBundle(options) {
  mkdirSync(options.outDir, { recursive: true });
  const specSrc = path.join(options.pluginRoot, "data", "specs");
  const updatesSrc = path.join(options.pluginRoot, "data", "updates");
  const mirrorSrc = path.join(options.pluginRoot, "data", "mirror");
  copyIfExists(specSrc, path.join(options.outDir, "data", "specs"));
  copyIfExists(updatesSrc, path.join(options.outDir, "data", "updates"));
  copyIfExists(mirrorSrc, path.join(options.outDir, "data", "mirror"));
  const files = walkFiles(options.outDir).filter((file) => !["manifest.json", "SHA256SUMS", "signature.sig"].includes(path.basename(file)));
  const entries = files.map((file) => {
    const body = readFileSync(file);
    return {
      path: path.relative(options.outDir, file).split(path.sep).join("/"),
      sha256: createHash("sha256").update(body).digest("hex"),
      bytes: body.length
    };
  });
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const sums = entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + "\n";
  writeFileSync(path.join(options.outDir, "SHA256SUMS"), sums);
  const manifest = {
    format: "hwops-offline-bundle",
    formatVersion: "1",
    createdAt: options.now ?? (/* @__PURE__ */ new Date()).toISOString(),
    pluginVersion: readVersion(options.pluginRoot),
    producer: "hw-spec-locator",
    files: entries,
    unavailableSources: options.unavailableSources ?? [],
    signature: options.signingKeyPem ? "present" : "absent"
  };
  writeFileSync(path.join(options.outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (options.signingKeyPem) {
    const signer = createSign("SHA256");
    signer.update(sums);
    signer.end();
    const signature = signer.sign(options.signingKeyPem);
    writeFileSync(path.join(options.outDir, "signature.sig"), signature);
  }
  return manifest;
}
function verifyBundle(bundleDir, publicKeyPem) {
  const manifest = JSON.parse(readFileSync(path.join(bundleDir, "manifest.json"), "utf8"));
  const sumsPath = path.join(bundleDir, "SHA256SUMS");
  const sums = readFileSync(sumsPath, "utf8");
  const mismatches = [];
  for (const entry of manifest.files) {
    const file = path.join(bundleDir, entry.path);
    if (!existsSync(file)) {
      mismatches.push(`missing ${entry.path}`);
      continue;
    }
    const body = readFileSync(file);
    const hash = createHash("sha256").update(body).digest("hex");
    if (hash !== entry.sha256) mismatches.push(`manifest hash mismatch ${entry.path}`);
    const line = `${entry.sha256}  ${entry.path}`;
    if (!sums.split("\n").includes(line)) mismatches.push(`SHA256SUMS missing ${entry.path}`);
  }
  const signaturePath = path.join(bundleDir, "signature.sig");
  let signature = "absent";
  if (existsSync(signaturePath)) {
    if (!publicKeyPem) signature = "unchecked";
    else {
      const verifier = createVerify("SHA256");
      verifier.update(sums);
      verifier.end();
      signature = verifier.verify(publicKeyPem, readFileSync(signaturePath)) ? "valid" : "invalid";
    }
  }
  const checksumsOk = mismatches.length === 0;
  const ok = checksumsOk && signature !== "invalid" && signature !== "unchecked";
  return {
    checksumsOk,
    signature,
    mismatches,
    message: ok ? "Bundle checksums match." + (signature === "valid" ? " Signature is valid." : " No signature was present.") : `Bundle verification failed. checksumsOk=${checksumsOk} signature=${signature}.`
  };
}
function readVersion(pluginRoot) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
    return manifest.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function copyIfExists(src, dest) {
  if (!existsSync(src)) return;
  cpSync(src, dest, { recursive: true });
}
function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walkFiles(full));
    else if (stat.isFile()) out.push(full);
  }
  return out;
}

export { exportBundle as e, verifyBundle as v };
