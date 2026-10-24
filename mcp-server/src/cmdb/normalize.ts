import type { NormalizedSystem } from "../redfish/types.js";
import type { Catalog } from "../specs/types.js";
import { getProduct } from "../specs/query.js";
import type { CmdbAsset, CmdbCategory } from "./model.js";

export function fromRedfish(system: NormalizedSystem, extras?: { managementIp?: string; name?: string; site?: string; rack?: string }): CmdbAsset {
  const category = guessCategory(system.model);
  return {
    schema: "hwops.cmdb.v1",
    id: system.serial || system.id,
    name: extras?.name || system.serial || `${system.manufacturer ?? "server"}-${system.id}`,
    category,
    vendor: system.manufacturer ?? (system.vendor === "unknown" ? undefined : system.vendor),
    model: system.model,
    serial: system.serial,
    status: system.health,
    managementIp: extras?.managementIp,
    site: extras?.site,
    rack: extras?.rack,
    cpuSummary: system.processorSummary,
    memoryMiB: system.memoryGiB !== undefined ? Math.round(system.memoryGiB * 1024) : sum(system.memory.map((dimm) => dimm.capacityMiB)),
    firmware: [
      ...(system.biosVersion ? [{ name: "BIOS", version: system.biosVersion }] : []),
      ...system.firmware
        .filter((item) => item.version)
        .map((item) => ({ name: item.name || item.id, version: item.version as string })),
    ],
    nics: system.ethernet.map((nic) => ({ name: nic.id, mac: nic.mac, speedMbps: nic.speedMbps })),
    powerPorts: [],
    source: "redfish",
  };
}

export function fromOneView(item: Record<string, unknown>): CmdbAsset {
  return {
    schema: "hwops.cmdb.v1",
    id: String(item.serialNumber ?? item.uuid ?? item.name ?? "oneview-server"),
    name: String(item.name ?? item.serialNumber ?? "oneview-server"),
    category: "server",
    model: item.model ? String(item.model) : undefined,
    serial: item.serialNumber ? String(item.serialNumber) : undefined,
    status: item.status ? String(item.status) : undefined,
    managementIp: item.mpHostName ? String(item.mpHostName) : undefined,
    cpuSummary: item.processorCount !== undefined ? `${String(item.processorCount)} processors` : undefined,
    memoryMiB: typeof item.memoryMb === "number" ? item.memoryMb : undefined,
    firmware: [],
    nics: [],
    powerPorts: [],
    source: "oneview",
  };
}

export function fromOme(item: Record<string, unknown>): CmdbAsset {
  const type = String(item.type ?? "");
  return {
    schema: "hwops.cmdb.v1",
    id: String(item.identifier ?? item.id ?? item.name ?? "ome-device"),
    name: String(item.name ?? item.identifier ?? "ome-device"),
    category: /storage/i.test(type) ? "storage" : /network|switch/i.test(type) ? "network" : "server",
    model: item.model ? String(item.model) : undefined,
    serial: item.identifier ? String(item.identifier) : undefined,
    status: item.status !== undefined ? String(item.status) : undefined,
    firmware: [],
    nics: [],
    powerPorts: [],
    source: "ome",
  };
}

export function fromSpec(catalog: Catalog, productId: string, extras?: { name?: string; serial?: string; assetTag?: string }): CmdbAsset {
  const product = getProduct(catalog, productId);
  if (!product) throw new Error(`Unknown spec id ${productId}.`);
  const memory = product.memory?.value;
  const memoryGb = memory && typeof memory.maxGb === "number" ? memory.maxGb : undefined;
  return {
    schema: "hwops.cmdb.v1",
    id: extras?.serial || extras?.name || product.id,
    name: extras?.name || product.model,
    category: product.category,
    vendor: product.vendor,
    model: product.model,
    serial: extras?.serial,
    assetTag: extras?.assetTag,
    memoryMiB: memoryGb !== undefined ? memoryGb * 1024 : undefined,
    firmware: product.firmwareBaseline.components.map((component) => ({ name: component.name, version: component.version })),
    nics: [],
    powerPorts: [],
    source: "spec",
  };
}

export function toCsv(assets: CmdbAsset[]): string {
  const headers = ["id", "name", "category", "vendor", "model", "serial", "assetTag", "status", "managementIp", "site", "rack", "cpuSummary", "memoryMiB", "source"];
  const lines = [headers.join(",")];
  for (const asset of assets) {
    lines.push(headers.map((key) => csv(String((asset as unknown as Record<string, unknown>)[key] ?? ""))).join(","));
  }
  return lines.join("\n");
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function sum(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => typeof value === "number");
  if (present.length === 0) return undefined;
  return present.reduce((total, value) => total + value, 0);
}

function guessCategory(model: string | undefined): CmdbCategory {
  const text = model?.toLowerCase() ?? "";
  if (/alletra|powerscale|powerstore|storage/.test(text)) return "storage";
  if (/switch|cx |powerswitch|aruba/.test(text)) return "network";
  return "server";
}
