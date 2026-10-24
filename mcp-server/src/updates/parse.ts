import { XMLParser } from "fast-xml-parser";
import zlib from "node:zlib";

export interface ParsedUpdate {
  name: string;
  version: string;
  componentType?: string;
  releaseDate?: string;
  productHint?: string;
  packagePath?: string;
}

export function decodeMaybeGzip(body: Buffer): string {
  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) return zlib.gunzipSync(body).toString("utf8");
  return body.toString("utf8");
}

export function parseDellCatalog(xml: string): ParsedUpdate[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => ["SoftwareComponent", "Device", "Model"].includes(name) });
  const doc = parser.parse(xml) as { Manifest?: { SoftwareComponent?: Record<string, unknown>[] } };
  const components = doc.Manifest?.SoftwareComponent ?? [];
  const records: ParsedUpdate[] = [];
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
        packagePath: stringAttr(component.path),
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
        productHint: hint,
      });
    }
  }
  return records;
}

export function parseDebianPackages(text: string): ParsedUpdate[] {
  const records: ParsedUpdate[] = [];
  for (const block of text.split(/\n\n+/)) {
    const fields = new Map<string, string>();
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

export function parseByContent(body: Buffer): { parser: string; records: ParsedUpdate[] } {
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

function stringAttr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function displayName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const display = (value as { Display?: unknown }).Display;
  if (typeof display === "string") return display;
  if (Array.isArray(display)) {
    const en = display.find((item) => item && typeof item === "object" && (item as { lang?: string }).lang === "en") as { "#text"?: string } | undefined;
    return en?.["#text"] || (typeof display[0] === "string" ? display[0] : undefined);
  }
  if (display && typeof display === "object" && "#text" in display) return String((display as { "#text": unknown })["#text"]);
  return undefined;
}

function deviceHints(component: Record<string, unknown>): string[] {
  const hints: string[] = [];
  const devices = component.SupportedDevices as { Device?: Record<string, unknown>[] } | undefined;
  for (const device of devices?.Device ?? []) {
    const name = displayName(device);
    if (name) hints.push(name);
  }
  const systems = component.SupportedSystems as { Brand?: { Model?: Record<string, unknown>[] } } | undefined;
  const models = systems?.Brand?.Model ?? [];
  for (const model of models) {
    const name = displayName(model);
    if (name) hints.push(name);
  }
  return [...new Set(hints)];
}
