import { a as assertOnline } from '../config.js';
import { d as decodeBody } from '../http.js';

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function str(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
class RedfishError extends Error {
}
class RedfishClient {
  constructor(http, baseUrl, username, password, config) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
    this.config = config;
  }
  token;
  url(path) {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`).toString();
  }
  async get(path) {
    assertOnline(this.config, this.url(path));
    const headers = { accept: "application/json" };
    if (this.token) headers["x-auth-token"] = this.token;
    else headers.authorization = basic(this.username, this.password);
    const res = await this.http({ method: "GET", url: this.url(path), headers, tlsVerify: this.config.tlsVerify });
    if (res.status === 401) throw new RedfishError("Redfish authentication failed. Check the redfish_username and redfish_password plugin settings.");
    if (res.status >= 400) throw new RedfishError(`Redfish GET ${path} returned HTTP ${res.status}.`);
    const parsed = JSON.parse(decodeBody(res).toString("utf8"));
    const record = asRecord(parsed);
    if (!record) throw new RedfishError(`Redfish GET ${path} did not return an object.`);
    return record;
  }
  async login() {
    const sessionUrl = this.url("/redfish/v1/SessionService/Sessions");
    assertOnline(this.config, sessionUrl);
    const res = await this.http({
      method: "POST",
      url: sessionUrl,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ UserName: this.username, Password: this.password }),
      tlsVerify: this.config.tlsVerify
    });
    const token = res.headers["x-auth-token"];
    if ((res.status === 200 || res.status === 201) && token) {
      this.token = token;
      return;
    }
    this.token = void 0;
  }
  async members(collectionPath) {
    const collection = await this.get(collectionPath);
    const raw = collection.Members;
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const member of raw) {
      const record = asRecord(member);
      if (!record) continue;
      const id = str(record["@odata.id"]);
      if (id && Object.keys(record).every((key) => key === "@odata.id")) {
        try {
          out.push(await this.get(id));
        } catch (error) {
          out.push({ "@odata.id": id, error: error instanceof Error ? error.message : String(error) });
        }
      } else {
        out.push(record);
      }
    }
    return out;
  }
  async collect() {
    const warnings = [];
    let root = null;
    try {
      root = await this.get("/redfish/v1/");
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    const systemsLink = link(root, "Systems") ?? "/redfish/v1/Systems";
    let systemRecords = [];
    try {
      systemRecords = await this.members(systemsLink);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    const systems = [];
    for (const system of systemRecords) {
      systems.push(await this.normalizeSystem(system, warnings));
    }
    return { serviceRoot: root, systems, warnings };
  }
  async normalizeSystem(system, warnings) {
    const manufacturer = str(system.Manufacturer);
    const oem = asRecord(system.Oem);
    const vendor = detectVendor(manufacturer, oem);
    const id = str(system.Id) ?? str(system["@odata.id"]) ?? "system";
    const processors = await this.tryMembers(link(system, "Processors"), warnings);
    const memory = await this.tryMembers(link(system, "Memory"), warnings);
    const storage = await this.tryMembers(link(system, "Storage"), warnings);
    const ethernet = await this.tryMembers(link(system, "EthernetInterfaces"), warnings);
    const firmware = await this.firmwareInventory(warnings);
    const status = asRecord(system.Status);
    const processorSummary = asRecord(system.ProcessorSummary);
    const memorySummary = asRecord(system.MemorySummary);
    const storageOut = [];
    for (const item of storage) {
      const drives = await this.drives(item, warnings);
      storageOut.push({
        id: str(item.Id) ?? str(item["@odata.id"]) ?? "storage",
        name: str(item.Name),
        drives
      });
    }
    return {
      vendor,
      manager: vendor === "HPE" ? "ilo" : vendor === "Dell" ? "idrac" : "redfish",
      id,
      manufacturer,
      model: str(system.Model),
      serial: str(system.SerialNumber),
      sku: str(system.SKU),
      partNumber: str(system.PartNumber),
      biosVersion: str(system.BiosVersion),
      powerState: str(system.PowerState),
      health: str(status?.Health) ?? str(status?.HealthRollup),
      state: str(status?.State),
      processorSummary: processorSummary ? [num(processorSummary.Count), str(processorSummary.Model)].filter(Boolean).join(" ") : void 0,
      memoryGiB: num(memorySummary?.TotalSystemMemoryGiB),
      processors: processors.map((item) => ({
        id: str(item.Id) ?? "cpu",
        model: str(item.Model),
        cores: num(item.TotalCores),
        status: str(asRecord(item.Status)?.Health)
      })),
      memory: memory.map((item) => ({
        id: str(item.Id) ?? "dimm",
        capacityMiB: num(item.CapacityMiB),
        type: str(item.MemoryDeviceType) ?? str(item.MemoryType),
        speedMHz: num(item.OperatingSpeedMhz),
        status: str(asRecord(item.Status)?.Health)
      })),
      storage: storageOut,
      ethernet: ethernet.map((item) => ({
        id: str(item.Id) ?? "nic",
        mac: str(item.MACAddress) ?? str(item.PermanentMACAddress),
        speedMbps: num(item.SpeedMbps),
        status: str(asRecord(item.Status)?.Health),
        hostname: str(item.HostName)
      })),
      firmware,
      managerFirmware: firmware.find((item) => /ilo|idrac|bmc/i.test(`${item.name ?? ""} ${item.id}`))
    };
  }
  async drives(storage, warnings) {
    const drivesLink = asRecord(storage.Drives);
    const embedded = Array.isArray(storage.Drives) ? storage.Drives : null;
    let records = [];
    if (embedded) {
      records = embedded.map((item) => asRecord(item)).filter((item) => Boolean(item));
    } else if (drivesLink && Array.isArray(drivesLink)) {
      records = [];
    } else {
      const collection = link(storage, "Drives");
      if (collection) records = await this.tryMembers(collection, warnings);
    }
    return records.map((item) => ({
      id: str(item.Id) ?? str(item["@odata.id"]) ?? "drive",
      name: str(item.Name),
      capacityBytes: num(item.CapacityBytes),
      mediaType: str(item.MediaType),
      protocol: str(item.Protocol),
      serial: str(item.SerialNumber),
      status: str(asRecord(item.Status)?.Health)
    }));
  }
  async firmwareInventory(warnings) {
    const records = await this.tryMembers("/redfish/v1/UpdateService/FirmwareInventory", warnings);
    return records.map((item) => ({
      id: str(item.Id) ?? "fw",
      name: str(item.Name),
      version: str(item.Version),
      updateable: typeof item.Updateable === "boolean" ? item.Updateable : void 0
    }));
  }
  async tryMembers(path, warnings) {
    if (!path) return [];
    try {
      return await this.members(path);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}
function link(record, key) {
  if (!record) return void 0;
  const value = record[key];
  if (typeof value === "string") return value;
  const obj = asRecord(value);
  return obj ? str(obj["@odata.id"]) : void 0;
}
function detectVendor(manufacturer, oem) {
  const text = `${manufacturer ?? ""} ${oem ? Object.keys(oem).join(" ") : ""}`.toLowerCase();
  if (text.includes("hpe") || text.includes("hewlett")) return "HPE";
  if (text.includes("dell")) return "Dell";
  return "unknown";
}
function basic(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
function redfishBase(host) {
  if (host.startsWith("http://") || host.startsWith("https://")) return host.replace(/\/$/, "");
  return `https://${host}`;
}

export { RedfishClient as R, redfishBase as r };
