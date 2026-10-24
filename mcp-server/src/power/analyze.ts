import type { Catalog, Product } from "../specs/types.js";
import { acceleratorTdpSum, getProduct, planningWatts } from "../specs/query.js";
import { phaseCapacityWatts, type PowerDevice, type PowerFinding, type PowerOutlet, type PowerPdu, type PowerPlan } from "./model.js";

export interface DeviceLoad {
  deviceId: string;
  watts: number | null;
  basis: string;
  incomplete: boolean;
  provenance: "operator" | "spec-planning" | "accelerator-tdp-only" | "unknown";
}

export interface PhaseLoad {
  pduId: string;
  feed: string;
  phaseId: string;
  capacityWatts: number | null;
  capacityBasis: string;
  normalWatts: number;
  failoverWatts: number;
  overloadNormal: boolean;
  overloadFailover: boolean;
}

export interface PowerReport {
  methodology: string[];
  deviceLoads: DeviceLoad[];
  phaseLoads: PhaseLoad[];
  pduLoads: { pduId: string; feed: string; normalWatts: number; failoverWatts: number; ratedWatts: number | null; overloadFailover: boolean }[];
  findings: PowerFinding[];
  netbox: ReturnType<typeof netboxPowerPayloads>;
}

export function analyzePower(plan: PowerPlan, catalog?: Catalog, options?: { includeComponentTdp?: boolean }): PowerReport {
  const findings: PowerFinding[] = [];
  const outlets = new Map<string, { pdu: PowerPdu; outlet: PowerOutlet }>();
  for (const pdu of plan.pdus) {
    for (const outlet of pdu.outlets) outlets.set(outlet.id, { pdu, outlet });
    if (pdu.phases.length === 0) {
      findings.push({ severity: "warning", code: "pdu-without-phases", pduId: pdu.id, message: `${pdu.name} has no phases.` });
    }
  }
  const deviceLoads: DeviceLoad[] = plan.devices.map((device) => resolveLoad(device, catalog, options?.includeComponentTdp === true, findings));
  const loadById = new Map(deviceLoads.map((load) => [load.deviceId, load]));

  interface Allocation {
    pduId: string;
    feed: string;
    phaseId: string;
    normal: number;
    failover: number;
  }
  const allocations: Allocation[] = [];

  for (const device of plan.devices) {
    const load = loadById.get(device.id);
    const mapped = device.psus
      .map((psu) => {
        if (!psu.outletId) {
          findings.push({
            severity: "warning",
            code: "unmapped-psu",
            deviceId: device.id,
            message: `${device.name} ${psu.id} is not mapped to an outlet.`,
          });
          return null;
        }
        const outlet = outlets.get(psu.outletId);
        if (!outlet) {
          findings.push({
            severity: "critical",
            code: "unknown-outlet",
            deviceId: device.id,
            message: `${device.name} ${psu.id} references unknown outlet ${psu.outletId}.`,
          });
          return null;
        }
        return { psu, ...outlet };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const feeds = new Set(mapped.map((item) => item.pdu.feed));
    const pdus = new Set(mapped.map((item) => item.pdu.id));
    const phases = new Set(mapped.map((item) => `${item.pdu.id}:${item.outlet.phaseId}`));
    if (device.psus.length < 2) {
      findings.push({ severity: "warning", code: "single-psu", deviceId: device.id, message: `${device.name} has fewer than two PSUs in the plan.` });
    } else if (feeds.size < 2) {
      findings.push({
        severity: "critical",
        code: "loss-of-feed-diversity",
        deviceId: device.id,
        message: `${device.name} PSUs land on a single feed (${[...feeds].join(", ") || "none"}).`,
      });
    }
    if (device.psus.length >= 2 && pdus.size < 2) {
      findings.push({ severity: "critical", code: "single-pdu", deviceId: device.id, message: `${device.name} PSUs land on a single PDU.` });
    }
    if (device.psus.length >= 2 && phases.size < 2 && feeds.size < 2) {
      findings.push({ severity: "warning", code: "single-phase", deviceId: device.id, message: `${device.name} PSUs share one phase.` });
    }

    if (!load || load.watts === null || mapped.length === 0) continue;
    const byFeed = new Map<string, typeof mapped>();
    for (const item of mapped) {
      const list = byFeed.get(item.pdu.feed) ?? [];
      list.push(item);
      byFeed.set(item.pdu.feed, list);
    }
    for (const [feed, items] of byFeed) {
      const phaseKeys = new Map<string, { pduId: string; phaseId: string }>();
      for (const item of items) phaseKeys.set(`${item.pdu.id}:${item.outlet.phaseId}`, { pduId: item.pdu.id, phaseId: item.outlet.phaseId });
      const phaseCount = Math.max(phaseKeys.size, 1);
      const normalShare = load.watts / byFeed.size / phaseCount;
      const failoverShare = load.watts / phaseCount;
      for (const phase of phaseKeys.values()) {
        allocations.push({
          pduId: phase.pduId,
          feed,
          phaseId: phase.phaseId,
          normal: normalShare,
          failover: failoverShare,
        });
      }
    }
  }

  const phaseLoads: PhaseLoad[] = [];
  for (const pdu of plan.pdus) {
    for (const phase of pdu.phases) {
      const related = allocations.filter((item) => item.pduId === pdu.id && item.phaseId === phase.id);
      const capacity = phaseCapacityWatts(phase);
      const normalWatts = round(related.reduce((total, item) => total + item.normal, 0));
      const failoverWatts = round(related.reduce((total, item) => total + item.failover, 0));
      const overloadNormal = capacity.watts !== null && normalWatts > capacity.watts;
      const overloadFailover = capacity.watts !== null && failoverWatts > capacity.watts;
      if (overloadFailover) {
        findings.push({
          severity: "critical",
          code: "phase-overload-failover",
          pduId: pdu.id,
          phaseId: phase.id,
          message: `${pdu.name} phase ${phase.id} failover load ${failoverWatts} W exceeds ${capacity.watts} W (${capacity.basis}).`,
        });
      } else if (overloadNormal) {
        findings.push({
          severity: "critical",
          code: "phase-overload",
          pduId: pdu.id,
          phaseId: phase.id,
          message: `${pdu.name} phase ${phase.id} normal load ${normalWatts} W exceeds ${capacity.watts} W.`,
        });
      }
      phaseLoads.push({
        pduId: pdu.id,
        feed: pdu.feed,
        phaseId: phase.id,
        capacityWatts: capacity.watts,
        capacityBasis: capacity.basis,
        normalWatts,
        failoverWatts,
        overloadNormal,
        overloadFailover,
      });
    }
  }

  const pduLoads = plan.pdus.map((pdu) => {
    const phases = phaseLoads.filter((phase) => phase.pduId === pdu.id);
    const normalWatts = round(phases.reduce((total, phase) => total + phase.normalWatts, 0));
    const failoverWatts = round(phases.reduce((total, phase) => total + phase.failoverWatts, 0));
    const overloadFailover = typeof pdu.ratedWatts === "number" && failoverWatts > pdu.ratedWatts;
    if (overloadFailover) {
      findings.push({
        severity: "critical",
        code: "pdu-overload-failover",
        pduId: pdu.id,
        message: `${pdu.name} failover load ${failoverWatts} W exceeds PDU rating ${pdu.ratedWatts} W.`,
      });
    }
    return { pduId: pdu.id, feed: pdu.feed, normalWatts, failoverWatts, ratedWatts: pdu.ratedWatts ?? null, overloadFailover };
  });

  return {
    methodology: [
      "Operator loadWatts overrides the spec.",
      "Otherwise the spec systemPlanningWatts value is used when its claim is verified or unverified and the number is present.",
      "Accelerator TDP is not added into rack load unless includeComponentTdp is true, and then it is labeled incomplete.",
      "Normal load splits a device evenly across the distinct feeds its mapped PSUs land on, then evenly across the distinct phases on that feed. That split is an assumption, not a measurement.",
      "Failover load places 100% of the device load on every feed that has a mapped PSU, then splits that amount evenly across the distinct phases on that feed.",
      "A phase capacity taken from voltage times amps is VA. Power factor is not applied.",
    ],
    deviceLoads,
    phaseLoads,
    pduLoads,
    findings,
    netbox: netboxPowerPayloads(plan, deviceLoads),
  };
}

function resolveLoad(device: PowerDevice, catalog: Catalog | undefined, includeComponentTdp: boolean, findings: PowerFinding[]): DeviceLoad {
  if (typeof device.loadWatts === "number") {
    return { deviceId: device.id, watts: device.loadWatts, basis: "operator loadWatts", incomplete: false, provenance: "operator" };
  }
  const product = device.specId && catalog ? getProduct(catalog, device.specId) : null;
  if (product) {
    const planning = planningWatts(product);
    if (planning.watts !== null) {
      return { deviceId: device.id, watts: planning.watts, basis: planning.basis, incomplete: false, provenance: "spec-planning" };
    }
    if (includeComponentTdp) {
      const tdp = acceleratorTdpSum(product);
      if (tdp) {
        findings.push({
          severity: "warning",
          code: "accelerator-tdp-only",
          deviceId: device.id,
          message: `${device.name}: ${tdp.label}`,
        });
        return { deviceId: device.id, watts: tdp.watts, basis: tdp.label, incomplete: true, provenance: "accelerator-tdp-only" };
      }
    }
  }
  findings.push({
    severity: "warning",
    code: "load-unknown",
    deviceId: device.id,
    message: `${device.name} has no operator loadWatts and no system planning wattage in the spec dataset. It is omitted from load totals.`,
  });
  return { deviceId: device.id, watts: null, basis: "unknown", incomplete: true, provenance: "unknown" };
}

export function netboxPowerPayloads(plan: PowerPlan, loads: DeviceLoad[]) {
  const loadById = new Map(loads.map((load) => [load.deviceId, load]));
  return {
    note: "Preview payloads for NetBox dcim power feeds, outlets, and ports. maximum_draw is set only when a wattage was resolved.",
    powerFeeds: plan.pdus.map((pdu) => ({
      name: `${pdu.name} feed ${pdu.feed}`,
      status: "active",
      type: "primary",
      supply: "ac",
      phase: pdu.phases.length >= 3 ? "three-phase" : "single-phase",
      comments: `hwops rack ${pdu.rackId}`,
    })),
    powerOutlets: plan.pdus.flatMap((pdu) =>
      pdu.outlets.map((outlet) => ({
        device: { name: pdu.name },
        name: outlet.name,
        feed_leg: outlet.phaseId,
      })),
    ),
    powerPorts: plan.devices.flatMap((device) => {
      const load = loadById.get(device.id);
      return device.psus.map((psu) => ({
        device: { name: device.name },
        name: psu.id,
        maximum_draw: load?.watts ?? null,
        allocated_draw: load && !load.incomplete ? load.watts : null,
      }));
    }),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function productFor(catalog: Catalog, specId: string): Product | null {
  return getProduct(catalog, specId);
}
