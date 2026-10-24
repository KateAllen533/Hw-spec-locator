import { assertOnline, type HwopsConfig } from "../config.js";
import { textBody, type HttpClient } from "../http.js";
import type { PowerPdu } from "./model.js";
import { SNMP_OIDS, snmpGet, type UdpTransport } from "./snmp.js";

export async function pullRedfishPdu(config: HwopsConfig, http: HttpClient, host: string): Promise<PowerPdu[]> {
  if (!config.redfishUsername || !config.redfishPassword) {
    throw new Error("Set HWOPS_REDFISH_USERNAME and HWOPS_REDFISH_PASSWORD to read a Redfish PDU.");
  }
  const base = host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
  const sessionUrl = `${base}/redfish/v1/SessionService/Sessions`;
  assertOnline(config, sessionUrl);
  const login = await http({
    method: "POST",
    url: sessionUrl,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ UserName: config.redfishUsername, Password: config.redfishPassword }),
    tlsVerify: config.tlsVerify,
  });
  const headers: Record<string, string> = { accept: "application/json" };
  if (login.headers["x-auth-token"]) headers["x-auth-token"] = login.headers["x-auth-token"];
  else headers.authorization = `Basic ${Buffer.from(`${config.redfishUsername}:${config.redfishPassword}`).toString("base64")}`;
  const collectionUrl = `${base}/redfish/v1/PowerEquipment/PowerDistribution`;
  const collection = await getJson(http, config, collectionUrl, headers);
  const members = Array.isArray(collection.Members) ? collection.Members : [];
  const pdus: PowerPdu[] = [];
  for (const member of members) {
    const id = (member as { "@odata.id"?: string })["@odata.id"];
    if (!id) continue;
    const pdu = await getJson(http, config, new URL(id, `${base}/`).toString(), headers);
    const branchesUrl = (pdu.Branches as { "@odata.id"?: string } | undefined)?.["@odata.id"];
    const outletsUrl = (pdu.Outlets as { "@odata.id"?: string } | undefined)?.["@odata.id"];
    const branches = branchesUrl ? await membersOf(http, config, new URL(branchesUrl, `${base}/`).toString(), headers) : [];
    const outlets = outletsUrl ? await membersOf(http, config, new URL(outletsUrl, `${base}/`).toString(), headers) : [];
    const phases = branches.map((branch, index) => ({
      id: String(branch.Id ?? `branch-${index + 1}`),
      voltage: reading(branch.NominalVoltage),
      ratedAmps: numberish(branch.RatedCurrentAmps),
      circuitId: typeof branch.Circuit === "string" ? branch.Circuit : undefined,
    }));
    const phaseIds = new Set(phases.map((phase) => phase.id));
    pdus.push({
      id: String(pdu.Id ?? id),
      name: String(pdu.Name ?? pdu.Id ?? "pdu"),
      rackId: "unassigned",
      feed: String(pdu.EquipmentType ?? "A"),
      vendor: typeof pdu.Manufacturer === "string" ? pdu.Manufacturer : undefined,
      model: typeof pdu.Model === "string" ? pdu.Model : undefined,
      phases: phases.length > 0 ? phases : [{ id: "A" }],
      outlets: outlets.map((outlet, index) => {
        const phase = String(outlet.PhaseWiringType ?? outlet.Branch ?? phases[0]?.id ?? "A");
        const phaseId = phaseIds.has(phase) ? phase : (phases[0]?.id ?? "A");
        return {
          id: String(outlet.Id ?? `outlet-${index + 1}`),
          name: String(outlet.Name ?? outlet.Id ?? `outlet-${index + 1}`),
          phaseId,
          ratedWatts: numberish(outlet.RatedPowerWatts),
        };
      }),
    });
  }
  return pdus;
}

export async function pullSnmpPdu(config: HwopsConfig, host: string, transport?: UdpTransport) {
  if (!config.snmpCommunity) throw new Error("Set HWOPS_SNMP_COMMUNITY. The community string is not accepted as a tool argument.");
  if (config.offline && !transport) {
    throw new Error("Air-gapped mode refuses live SNMP. Pass a captured response through tests, or unset HWOPS_OFFLINE on the management network.");
  }
  const bindings = await snmpGet({
    host,
    community: config.snmpCommunity,
    oids: [SNMP_OIDS.sysDescr, SNMP_OIDS.sysName],
    transport,
  });
  return {
    note: "SNMPv2c read of sysDescr and sysName. Outlet and phase readings are vendor-MIB specific and are not inferred when those OIDs were not queried.",
    host,
    bindings,
  };
}

async function membersOf(http: HttpClient, config: HwopsConfig, url: string, headers: Record<string, string>) {
  const body = await getJson(http, config, url, headers);
  const members = Array.isArray(body.Members) ? body.Members : [];
  const out: Record<string, unknown>[] = [];
  for (const member of members) {
    const record = member as Record<string, unknown>;
    const link = typeof record["@odata.id"] === "string" ? record["@odata.id"] : undefined;
    if (link && Object.keys(record).length === 1) {
      out.push(await getJson(http, config, new URL(link, url).toString(), headers));
    } else {
      out.push(record);
    }
  }
  return out;
}

async function getJson(http: HttpClient, config: HwopsConfig, url: string, headers: Record<string, string>) {
  assertOnline(config, url);
  const res = await http({ url, headers, tlsVerify: config.tlsVerify });
  if (res.status >= 400) throw new Error(`Redfish PDU GET ${url} returned HTTP ${res.status}.`);
  return JSON.parse(textBody(res)) as Record<string, unknown>;
}

function reading(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "Reading" in value) {
    const readingValue = (value as { Reading?: unknown }).Reading;
    return typeof readingValue === "number" ? readingValue : undefined;
  }
  return undefined;
}

function numberish(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
