export interface PowerPhase {
  id: string;
  voltage?: number;
  ratedAmps?: number;
  ratedWatts?: number;
  circuitId?: string;
}

export interface PowerOutlet {
  id: string;
  name: string;
  phaseId: string;
  ratedWatts?: number;
}

export interface PowerPdu {
  id: string;
  name: string;
  rackId: string;
  feed: string;
  ratedWatts?: number;
  phases: PowerPhase[];
  outlets: PowerOutlet[];
  vendor?: string;
  model?: string;
}

export interface PowerPsu {
  id: string;
  outletId?: string;
}

export interface PowerDevice {
  id: string;
  name: string;
  rackId: string;
  specId?: string;
  loadWatts?: number;
  psus: PowerPsu[];
}

export interface PowerRack {
  id: string;
  name: string;
  site?: string;
}

export interface PowerPlan {
  racks: PowerRack[];
  pdus: PowerPdu[];
  devices: PowerDevice[];
}

export interface PowerFinding {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  deviceId?: string;
  pduId?: string;
  phaseId?: string;
}

export function phaseCapacityWatts(phase: PowerPhase): { watts: number | null; basis: string } {
  if (typeof phase.ratedWatts === "number") return { watts: phase.ratedWatts, basis: "phase.ratedWatts" };
  if (typeof phase.voltage === "number" && typeof phase.ratedAmps === "number") {
    return {
      watts: phase.voltage * phase.ratedAmps,
      basis: "voltage multiplied by rated amps (VA). Power factor is not applied.",
    };
  }
  return { watts: null, basis: "phase has neither ratedWatts nor voltage and ratedAmps" };
}
