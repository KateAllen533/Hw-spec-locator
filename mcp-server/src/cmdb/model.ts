export type CmdbCategory = "server" | "storage" | "network" | "pdu" | "other";

export interface CmdbNic {
  name: string;
  mac?: string;
  speedMbps?: number;
}

export interface CmdbPowerPort {
  name: string;
  maximumDrawWatts?: number;
}

export interface CmdbAsset {
  schema: "hwops.cmdb.v1";
  id: string;
  name: string;
  category: CmdbCategory;
  vendor?: string;
  model?: string;
  serial?: string;
  assetTag?: string;
  status?: string;
  managementIp?: string;
  site?: string;
  rack?: string;
  rackUnit?: number;
  cpuSummary?: string;
  memoryMiB?: number;
  firmware: { name: string; version: string }[];
  nics: CmdbNic[];
  powerPorts: CmdbPowerPort[];
  source: "redfish" | "oneview" | "ome" | "spec" | "manual" | "pdu";
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
