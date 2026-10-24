import { assertOnline, type HwopsConfig } from "../config.js";
import { decodeBody, type HttpClient } from "../http.js";
import type { NormalizedSystem, RedfishCollectionResult } from "./types.js";

interface JsonRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export class RedfishError extends Error {}

export class RedfishClient {
  private token?: string;

  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly config: HwopsConfig,
  ) {}

  private url(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`).toString();
  }

  async get(path: string): Promise<JsonRecord> {
    assertOnline(this.config, this.url(path));
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers["x-auth-token"] = this.token;
    else headers.authorization = basic(this.username, this.password);
    const res = await this.http({ method: "GET", url: this.url(path), headers, tlsVerify: this.config.tlsVerify });
    if (res.status === 401) throw new RedfishError("Redfish authentication failed. Check HWOPS_REDFISH_USERNAME and HWOPS_REDFISH_PASSWORD.");
    if (res.status >= 400) throw new RedfishError(`Redfish GET ${path} returned HTTP ${res.status}.`);
    const parsed = JSON.parse(decodeBody(res).toString("utf8")) as unknown;
    const record = asRecord(parsed);
    if (!record) throw new RedfishError(`Redfish GET ${path} did not return an object.`);
    return record;
  }

  async login(): Promise<void> {
    const sessionUrl = this.url("/redfish/v1/SessionService/Sessions");
    assertOnline(this.config, sessionUrl);
    const res = await this.http({
      method: "POST",
      url: sessionUrl,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ UserName: this.username, Password: this.password }),
      tlsVerify: this.config.tlsVerify,
    });
    const token = res.headers["x-auth-token"];
    if ((res.status === 200 || res.status === 201) && token) {
      this.token = token;
      return;
    }
    this.token = undefined;
  }

  async members(collectionPath: string): Promise<JsonRecord[]> {
    const collection = await this.get(collectionPath);
    const raw = collection.Members;
    if (!Array.isArray(raw)) return [];
    const out: JsonRecord[] = [];
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

  async collect(): Promise<RedfishCollectionResult> {
    const warnings: string[] = [];
    let root: JsonRecord | null = null;
    try {
      root = await this.get("/redfish/v1/");
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    const systemsLink = link(root, "Systems") ?? "/redfish/v1/Systems";
    let systemRecords: JsonRecord[] = [];
    try {
      systemRecords = await this.members(systemsLink);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    const systems: NormalizedSystem[] = [];
    for (const system of systemRecords) {
      systems.push(await this.normalizeSystem(system, warnings));
    }
    return { serviceRoot: root, systems, warnings };
  }

  private async normalizeSystem(system: JsonRecord, warnings: string[]): Promise<NormalizedSystem> {
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
        drives,
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
      processorSummary: processorSummary ? [num(processorSummary.Count), str(processorSummary.Model)].filter(Boolean).join(" ") : undefined,
      memoryGiB: num(memorySummary?.TotalSystemMemoryGiB),
      processors: processors.map((item) => ({
        id: str(item.Id) ?? "cpu",
        model: str(item.Model),
        cores: num(item.TotalCores),
        status: str(asRecord(item.Status)?.Health),
      })),
      memory: memory.map((item) => ({
        id: str(item.Id) ?? "dimm",
        capacityMiB: num(item.CapacityMiB),
        type: str(item.MemoryDeviceType) ?? str(item.MemoryType),
        speedMHz: num(item.OperatingSpeedMhz),
        status: str(asRecord(item.Status)?.Health),
      })),
      storage: storageOut,
      ethernet: ethernet.map((item) => ({
        id: str(item.Id) ?? "nic",
        mac: str(item.MACAddress) ?? str(item.PermanentMACAddress),
        speedMbps: num(item.SpeedMbps),
        status: str(asRecord(item.Status)?.Health),
        hostname: str(item.HostName),
      })),
      firmware,
      managerFirmware: firmware.find((item) => /ilo|idrac|bmc/i.test(`${item.name ?? ""} ${item.id}`)),
    };
  }

  private async drives(storage: JsonRecord, warnings: string[]) {
    const drivesLink = asRecord(storage.Drives);
    const embedded = Array.isArray(storage.Drives) ? storage.Drives : null;
    let records: JsonRecord[] = [];
    if (embedded) {
      records = embedded.map((item) => asRecord(item)).filter((item): item is JsonRecord => Boolean(item));
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
      status: str(asRecord(item.Status)?.Health),
    }));
  }

  private async firmwareInventory(warnings: string[]) {
    const records = await this.tryMembers("/redfish/v1/UpdateService/FirmwareInventory", warnings);
    return records.map((item) => ({
      id: str(item.Id) ?? "fw",
      name: str(item.Name),
      version: str(item.Version),
      updateable: typeof item.Updateable === "boolean" ? item.Updateable : undefined,
    }));
  }

  private async tryMembers(path: string | undefined, warnings: string[]): Promise<JsonRecord[]> {
    if (!path) return [];
    try {
      return await this.members(path);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}

function link(record: JsonRecord | null, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  if (typeof value === "string") return value;
  const obj = asRecord(value);
  return obj ? str(obj["@odata.id"]) : undefined;
}

function detectVendor(manufacturer: string | undefined, oem: JsonRecord | null): "HPE" | "Dell" | "unknown" {
  const text = `${manufacturer ?? ""} ${oem ? Object.keys(oem).join(" ") : ""}`.toLowerCase();
  if (text.includes("hpe") || text.includes("hewlett")) return "HPE";
  if (text.includes("dell")) return "Dell";
  return "unknown";
}

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function redfishBase(host: string): string {
  if (host.startsWith("http://") || host.startsWith("https://")) return host.replace(/\/$/, "");
  return `https://${host}`;
}
