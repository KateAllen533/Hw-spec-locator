export type Nos = "aos-cx" | "os10" | "sonic" | "cumulus-nvue" | "junos";
export type Design = "access-vlan" | "ai-rail" | "evpn-vxlan" | "storage" | "oob";
export type PortRole = "server" | "gpu-rail" | "storage" | "frontend" | "oob" | "isl" | "keepalive" | "uplink" | "unused";

export interface VlanIntent {
  id: number;
  name: string;
  description?: string;
}

export interface InterfaceIntent {
  name: string;
  description?: string;
  role: PortRole;
  mode: "access" | "trunk" | "routed" | "unused";
  accessVlan?: number;
  trunkVlans?: number[];
  nativeVlan?: number;
  mtu?: number;
  lag?: string;
  rail?: number;
  server?: string;
  serverNic?: string;
  roce?: boolean;
}

export interface LagIntent {
  id: string;
  members: string[];
  lacp: boolean;
  mode: "access" | "trunk";
  accessVlan?: number;
  trunkVlans?: number[];
  mtu?: number;
  purpose?: "server" | "isl" | "uplink" | "storage";
}

export interface MlagIntent {
  kind: "vsx" | "vlt";
  domainId?: number;
  role?: "primary" | "secondary";
  systemMac?: string;
  islLag?: string;
  keepalivePeer?: string;
  keepaliveSource?: string;
  keepaliveVrf?: string;
  discoveryInterfaces?: string[];
  backupDestination?: string;
}

export interface EvpnIntent {
  asn: number;
  routerId: string;
  loopback: string;
  neighbors: { ip: string; asn: number }[];
  vnis: { vni: number; vlan: number }[];
}

export interface RoceIntent {
  enabled: boolean;
  pfcPriorities: number[];
  ecnMinKb?: number;
  ecnMaxKb?: number;
  ecnProbabilityPercent?: number;
  dcqcn?: boolean;
  mtu: number;
}

export interface RailIntent {
  rail: number;
  leaf: string;
  links: { server: string; nic: string; switchPort: string }[];
}

export interface FabricIntent {
  name: string;
  design: Design;
  nos: Nos;
  deviceModel?: string;
  hostname: string;
  vlans: VlanIntent[];
  interfaces: InterfaceIntent[];
  lags?: LagIntent[];
  mlag?: MlagIntent;
  evpn?: EvpnIntent;
  roce?: RoceIntent;
  rails?: RailIntent[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}
