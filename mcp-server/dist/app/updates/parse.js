import { X as XMLParser } from '../../vendor/fast-xml-parser.js';
import zlib from 'node:zlib';

function decodeMaybeGzip(body) {
  if (body.length >= 2 && body[0] === 31 && body[1] === 139) return zlib.gunzipSync(body).toString("utf8");
  return body.toString("utf8");
}
function parseDellCatalog(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => ["SoftwareComponent", "Device", "Model"].includes(name) });
  const doc = parser.parse(xml);
  const components = doc.Manifest?.SoftwareComponent ?? [];
  const records = [];
  for (const component of components) {
    const version = stringAttr(component.dellVersion) || stringAttr(component.vendorVersion);
    const name = displayName(component.Name) || stringAttr(component.componentType) || "package";
    if (!version) continue;
    const hints = deviceHints(component);
    if (hints.length === 0) {
      records.push({
        name,
        version,
        componentType: stringAttr(component.componentType),
        releaseDate: stringAttr(component.releaseDate),
        packagePath: stringAttr(component.path)
      });
      continue;
    }
    for (const hint of hints) {
      records.push({
        name,
        version,
        componentType: stringAttr(component.componentType),
        releaseDate: stringAttr(component.releaseDate),
        packagePath: stringAttr(component.path),
        productHint: hint
      });
    }
  }
  return records;
}
function parseDebianPackages(text) {
  const records = [];
  for (const block of text.split(/\n\n+/)) {
    const fields = /* @__PURE__ */ new Map();
    for (const line of block.split(/\n/)) {
      const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
      if (match) fields.set(match[1], match[2]);
    }
    const name = fields.get("Package");
    const version = fields.get("Version");
    if (!name || !version) continue;
    records.push({ name, version, packagePath: fields.get("Filename"), componentType: "package" });
  }
  return records;
}
function parseByContent(body) {
  const text = decodeMaybeGzip(body);
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<Manifest") || trimmed.includes("<SoftwareComponent")) {
    return { parser: "dell-catalog-xml", records: parseDellCatalog(text) };
  }
  if (trimmed.includes("\nPackage:") || trimmed.startsWith("Package:")) {
    return { parser: "debian-packages", records: parseDebianPackages(text) };
  }
  return { parser: "unrecognized", records: [] };
}
function stringAttr(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function displayName(value) {
  if (!value || typeof value !== "object") return void 0;
  const display = value.Display;
  if (typeof display === "string") return display;
  if (Array.isArray(display)) {
    const en = display.find((item) => item && typeof item === "object" && item.lang === "en");
    return en?.["#text"] || (typeof display[0] === "string" ? display[0] : void 0);
  }
  if (display && typeof display === "object" && "#text" in display) return String(display["#text"]);
  return void 0;
}
function deviceHints(component) {
  const hints = [];
  const devices = component.SupportedDevices;
  for (const device of devices?.Device ?? []) {
    const name = displayName(device);
    if (name) hints.push(name);
  }
  const systems = component.SupportedSystems;
  const models = systems?.Brand?.Model ?? [];
  for (const model of models) {
    const name = displayName(model);
    if (name) hints.push(name);
  }
  return [...new Set(hints)];
}

export { parseByContent as p };
