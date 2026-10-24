export interface NormalizedDrive {
  id: string;
  name?: string;
  capacityBytes?: number;
  mediaType?: string;
  protocol?: string;
  serial?: string;
  status?: string;
}

export interface NormalizedSystem {
  vendor: "HPE" | "Dell" | "unknown";
  manager: "ilo" | "idrac" | "redfish";
  id: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  sku?: string;
  partNumber?: string;
  biosVersion?: string;
  powerState?: string;
  health?: string;
  state?: string;
  processorSummary?: string;
  memoryGiB?: number;
  processors: { id: string; model?: string; cores?: number; status?: string }[];
  memory: { id: string; capacityMiB?: number; type?: string; speedMHz?: number; status?: string }[];
  storage: { id: string; name?: string; drives: NormalizedDrive[] }[];
  ethernet: { id: string; mac?: string; speedMbps?: number; status?: string; hostname?: string }[];
  firmware: { id: string; name?: string; version?: string; updateable?: boolean }[];
  managerFirmware?: { id: string; name?: string; version?: string };
}

export interface RedfishCollectionResult {
  serviceRoot: Record<string, unknown> | null;
  systems: NormalizedSystem[];
  warnings: string[];
}
