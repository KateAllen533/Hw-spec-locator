import { g as getProduct } from '../specs/query.js';

function fromRedfish(system, extras) {
  const category = guessCategory(system.model);
  return {
    schema: "hwops.cmdb.v1",
    id: system.serial || system.id,
    name: extras?.name || system.serial || `${system.manufacturer ?? "server"}-${system.id}`,
    category,
    vendor: system.manufacturer ?? (system.vendor === "unknown" ? void 0 : system.vendor),
    model: system.model,
    serial: system.serial,
    status: system.health,
    managementIp: extras?.managementIp,
    site: extras?.site,
    rack: extras?.rack,
    cpuSummary: system.processorSummary,
    memoryMiB: system.memoryGiB !== void 0 ? Math.round(system.memoryGiB * 1024) : sum(system.memory.map((dimm) => dimm.capacityMiB)),
    firmware: [
      ...system.biosVersion ? [{ name: "BIOS", version: system.biosVersion }] : [],
      ...system.firmware.filter((item) => item.version).map((item) => ({ name: item.name || item.id, version: item.version }))
    ],
    nics: system.ethernet.map((nic) => ({ name: nic.id, mac: nic.mac, speedMbps: nic.speedMbps })),
    powerPorts: [],
    source: "redfish"
  };
}
function fromOneView(item) {
  return {
    schema: "hwops.cmdb.v1",
    id: String(item.serialNumber ?? item.uuid ?? item.name ?? "oneview-server"),
    name: String(item.name ?? item.serialNumber ?? "oneview-server"),
    category: "server",
    model: item.model ? String(item.model) : void 0,
    serial: item.serialNumber ? String(item.serialNumber) : void 0,
    status: item.status ? String(item.status) : void 0,
    managementIp: item.mpHostName ? String(item.mpHostName) : void 0,
    cpuSummary: item.processorCount !== void 0 ? `${String(item.processorCount)} processors` : void 0,
    memoryMiB: typeof item.memoryMb === "number" ? item.memoryMb : void 0,
    firmware: [],
    nics: [],
    powerPorts: [],
    source: "oneview"
  };
}
function fromOme(item) {
  const type = String(item.type ?? "");
  return {
    schema: "hwops.cmdb.v1",
    id: String(item.identifier ?? item.id ?? item.name ?? "ome-device"),
    name: String(item.name ?? item.identifier ?? "ome-device"),
    category: /storage/i.test(type) ? "storage" : /network|switch/i.test(type) ? "network" : "server",
    model: item.model ? String(item.model) : void 0,
    serial: item.identifier ? String(item.identifier) : void 0,
    status: item.status !== void 0 ? String(item.status) : void 0,
    firmware: [],
    nics: [],
    powerPorts: [],
    source: "ome"
  };
}
function fromSpec(catalog, productId, extras) {
  const product = getProduct(catalog, productId);
  if (!product) throw new Error(`Unknown spec id ${productId}.`);
  const memory = product.memory?.value;
  const memoryGb = memory && typeof memory.maxGb === "number" ? memory.maxGb : void 0;
  return {
    schema: "hwops.cmdb.v1",
    id: extras?.serial || extras?.name || product.id,
    name: extras?.name || product.model,
    category: product.category,
    vendor: product.vendor,
    model: product.model,
    serial: extras?.serial,
    assetTag: extras?.assetTag,
    memoryMiB: memoryGb !== void 0 ? memoryGb * 1024 : void 0,
    firmware: product.firmwareBaseline.components.map((component) => ({ name: component.name, version: component.version })),
    nics: [],
    powerPorts: [],
    source: "spec"
  };
}
function toCsv(assets) {
  const headers = ["id", "name", "category", "vendor", "model", "serial", "assetTag", "status", "managementIp", "site", "rack", "cpuSummary", "memoryMiB", "source"];
  const lines = [headers.join(",")];
  for (const asset of assets) {
    lines.push(headers.map((key) => csv(String(asset[key] ?? ""))).join(","));
  }
  return lines.join("\n");
}
function csv(value) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function sum(values) {
  const present = values.filter((value) => typeof value === "number");
  if (present.length === 0) return void 0;
  return present.reduce((total, value) => total + value, 0);
}
function guessCategory(model) {
  const text = model?.toLowerCase() ?? "";
  if (/alletra|powerscale|powerstore|storage/.test(text)) return "storage";
  if (/switch|cx |powerswitch|aruba/.test(text)) return "network";
  return "server";
}

export { fromRedfish as a, fromOneView as b, fromOme as c, fromSpec as f, toCsv as t };
