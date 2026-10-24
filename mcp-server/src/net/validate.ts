import type { FabricIntent, ValidationIssue } from "./intent.js";

const NOS_FOR_MODEL: Record<string, string[]> = {
  "dell-powerswitch-z9864f-on": ["sonic", "cumulus-nvue"],
  "hpe-aruba-cx-9300-32d": ["aos-cx"],
};

export function validateIntent(intent: FabricIntent): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const vlanIds = new Set<number>();
  for (const vlan of intent.vlans) {
    if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) {
      issues.push({ severity: "error", code: "vlan-id", message: `VLAN ${vlan.id} is outside 1-4094.` });
    }
    if (vlanIds.has(vlan.id)) issues.push({ severity: "error", code: "vlan-duplicate", message: `VLAN ${vlan.id} is duplicated.` });
    vlanIds.add(vlan.id);
  }
  const ifaceNames = new Set(intent.interfaces.map((iface) => iface.name));
  for (const iface of intent.interfaces) {
    if (!iface.name.trim()) issues.push({ severity: "error", code: "interface-name", message: "An interface has an empty name." });
    if (iface.mode === "access" && iface.accessVlan !== undefined && !vlanIds.has(iface.accessVlan)) {
      issues.push({ severity: "error", code: "vlan-missing", message: `${iface.name} access VLAN ${iface.accessVlan} is not defined.` });
    }
    for (const vlan of iface.trunkVlans ?? []) {
      if (!vlanIds.has(vlan)) issues.push({ severity: "error", code: "vlan-missing", message: `${iface.name} trunk VLAN ${vlan} is not defined.` });
    }
    if (iface.mtu !== undefined && (iface.mtu < 1500 || iface.mtu > 9216)) {
      issues.push({ severity: "error", code: "mtu", message: `${iface.name} MTU ${iface.mtu} is outside 1500-9216.` });
    }
    if (intent.design === "ai-rail" && iface.role === "gpu-rail" && iface.rail === undefined) {
      issues.push({ severity: "error", code: "rail-missing", message: `${iface.name} is a GPU rail port without a rail number.` });
    }
    if (iface.roce && (iface.mtu ?? intent.roce?.mtu ?? 1500) < 9000) {
      issues.push({ severity: "warning", code: "roce-mtu", message: `${iface.name} is marked RoCE with MTU below 9000.` });
    }
  }
  for (const lag of intent.lags ?? []) {
    for (const member of lag.members) {
      if (!ifaceNames.has(member)) issues.push({ severity: "error", code: "lag-member", message: `LAG ${lag.id} member ${member} is not an interface.` });
    }
    if (lag.members.length < 1) issues.push({ severity: "error", code: "lag-empty", message: `LAG ${lag.id} has no members.` });
  }
  if (intent.mlag) {
    if (intent.mlag.kind === "vsx" && intent.nos !== "aos-cx") {
      issues.push({ severity: "error", code: "mlag-nos", message: "VSX is only rendered for aos-cx." });
    }
    if (intent.mlag.kind === "vlt" && intent.nos !== "os10") {
      issues.push({ severity: "error", code: "mlag-nos", message: "VLT is only rendered for os10." });
    }
    if (!intent.mlag.islLag && !(intent.mlag.discoveryInterfaces && intent.mlag.discoveryInterfaces.length > 0)) {
      issues.push({ severity: "error", code: "mlag-isl", message: "MLAG needs an ISL LAG or discovery interfaces." });
    }
    if (intent.mlag.kind === "vsx" && !intent.mlag.keepalivePeer) {
      issues.push({ severity: "warning", code: "vsx-keepalive", message: "VSX keepalive peer is not set." });
    }
    const discovery = new Set(intent.mlag.discoveryInterfaces ?? []);
    for (const lag of intent.lags ?? []) {
      if (lag.purpose === "isl") {
        for (const member of lag.members) {
          if (discovery.has(member)) {
            issues.push({ severity: "warning", code: "keepalive-isl-overlap", message: `${member} is both a VLT discovery interface and an ISL LAG member.` });
          }
        }
      }
    }
  }
  if (intent.roce?.enabled) {
    const priorities = intent.roce.pfcPriorities;
    if (priorities.length === 0) issues.push({ severity: "error", code: "pfc-empty", message: "RoCE is enabled without PFC priorities." });
    const seen = new Set<number>();
    for (const priority of priorities) {
      if (!Number.isInteger(priority) || priority < 0 || priority > 7) {
        issues.push({ severity: "error", code: "pfc-priority", message: `PFC priority ${priority} is outside 0-7.` });
      }
      if (seen.has(priority)) issues.push({ severity: "error", code: "pfc-duplicate", message: `PFC priority ${priority} is duplicated.` });
      seen.add(priority);
    }
    if (intent.roce.ecnMinKb !== undefined && intent.roce.ecnMaxKb !== undefined && intent.roce.ecnMinKb >= intent.roce.ecnMaxKb) {
      issues.push({ severity: "error", code: "ecn-range", message: "ECN minimum must be lower than ECN maximum." });
    }
    if (intent.roce.ecnProbabilityPercent !== undefined && (intent.roce.ecnProbabilityPercent < 0 || intent.roce.ecnProbabilityPercent > 100)) {
      issues.push({ severity: "error", code: "ecn-probability", message: "ECN probability must be between 0 and 100." });
    }
    if (intent.roce.mtu < 9000) issues.push({ severity: "warning", code: "roce-mtu", message: "RoCE MTU is below 9000." });
    issues.push({
      severity: "warning",
      code: "roce-cli-unverified",
      message: "PFC, ECN, and DCQCN parameters are validated structurally. The rendered QoS CLI is marked unverified and is not applied unless HWOPS_ALLOW_UNVERIFIED_APPLY=true.",
    });
  }
  if (intent.evpn) {
    if (intent.evpn.asn < 1 || intent.evpn.asn > 4294967295) issues.push({ severity: "error", code: "asn", message: "BGP ASN is out of range." });
    for (const vni of intent.evpn.vnis) {
      if (!vlanIds.has(vni.vlan)) issues.push({ severity: "error", code: "vni-vlan", message: `VNI ${vni.vni} maps to undefined VLAN ${vni.vlan}.` });
      if (vni.vni < 1 || vni.vni > 16777215) issues.push({ severity: "error", code: "vni", message: `VNI ${vni.vni} is out of range.` });
    }
    issues.push({
      severity: "warning",
      code: "evpn-cli-unverified",
      message: "EVPN parameters are echoed as an unverified block. This plugin does not emit vendor EVPN CLI as pinned configuration.",
    });
  }
  if (intent.deviceModel && NOS_FOR_MODEL[intent.deviceModel] && !NOS_FOR_MODEL[intent.deviceModel].includes(intent.nos)) {
    issues.push({
      severity: "warning",
      code: "nos-model",
      message: `${intent.deviceModel} starter spec does not list ${intent.nos} as a stated operating system. Confirm the NOS before use.`,
    });
  }
  if (intent.rails) {
    for (const rail of intent.rails) {
      const leaves = new Set([rail.leaf]);
      if (leaves.size !== 1) {
        issues.push({ severity: "error", code: "rail-split", message: `Rail ${rail.rail} is split across leaves.` });
      }
      const ports = rail.links.map((link) => link.switchPort);
      if (new Set(ports).size !== ports.length) {
        issues.push({ severity: "error", code: "rail-port", message: `Rail ${rail.rail} reuses a switch port.` });
      }
    }
  }
  return { ok: !issues.some((issue) => issue.severity === "error"), issues };
}
