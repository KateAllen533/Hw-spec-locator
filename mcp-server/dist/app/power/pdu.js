import { a as assertOnline } from '../config.js';
import { t as textBody } from '../http.js';
import { s as snmpGet, S as SNMP_OIDS } from './snmp.js';

async function pullRedfishPdu(config, http, host) {
  if (!config.redfishUsername || !config.redfishPassword) {
    throw new Error("Set the redfish_username and redfish_password plugin settings to read a Redfish PDU.");
  }
  const base = host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
  const sessionUrl = `${base}/redfish/v1/SessionService/Sessions`;
  assertOnline(config, sessionUrl);
  const login = await http({
    method: "POST",
    url: sessionUrl,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ UserName: config.redfishUsername, Password: config.redfishPassword }),
    tlsVerify: config.tlsVerify
  });
  const headers = { accept: "application/json" };
  if (login.headers["x-auth-token"]) headers["x-auth-token"] = login.headers["x-auth-token"];
  else headers.authorization = `Basic ${Buffer.from(`${config.redfishUsername}:${config.redfishPassword}`).toString("base64")}`;
  const collectionUrl = `${base}/redfish/v1/PowerEquipment/PowerDistribution`;
  const collection = await getJson(http, config, collectionUrl, headers);
  const members = Array.isArray(collection.Members) ? collection.Members : [];
  const pdus = [];
  for (const member of members) {
    const id = member["@odata.id"];
    if (!id) continue;
    const pdu = await getJson(http, config, new URL(id, `${base}/`).toString(), headers);
    const branchesUrl = pdu.Branches?.["@odata.id"];
    const outletsUrl = pdu.Outlets?.["@odata.id"];
    const branches = branchesUrl ? await membersOf(http, config, new URL(branchesUrl, `${base}/`).toString(), headers) : [];
    const outlets = outletsUrl ? await membersOf(http, config, new URL(outletsUrl, `${base}/`).toString(), headers) : [];
    const phases = branches.map((branch, index) => ({
      id: String(branch.Id ?? `branch-${index + 1}`),
      voltage: reading(branch.NominalVoltage),
      ratedAmps: numberish(branch.RatedCurrentAmps),
      circuitId: typeof branch.Circuit === "string" ? branch.Circuit : void 0
    }));
    const phaseIds = new Set(phases.map((phase) => phase.id));
    pdus.push({
      id: String(pdu.Id ?? id),
      name: String(pdu.Name ?? pdu.Id ?? "pdu"),
      rackId: "unassigned",
      feed: String(pdu.EquipmentType ?? "A"),
      vendor: typeof pdu.Manufacturer === "string" ? pdu.Manufacturer : void 0,
      model: typeof pdu.Model === "string" ? pdu.Model : void 0,
      phases: phases.length > 0 ? phases : [{ id: "A" }],
      outlets: outlets.map((outlet, index) => {
        const phase = String(outlet.PhaseWiringType ?? outlet.Branch ?? phases[0]?.id ?? "A");
        const phaseId = phaseIds.has(phase) ? phase : phases[0]?.id ?? "A";
        return {
          id: String(outlet.Id ?? `outlet-${index + 1}`),
          name: String(outlet.Name ?? outlet.Id ?? `outlet-${index + 1}`),
          phaseId,
          ratedWatts: numberish(outlet.RatedPowerWatts)
        };
      })
    });
  }
  return pdus;
}
async function pullSnmpPdu(config, host, transport) {
  if (!config.snmpCommunity) throw new Error("Set the snmp_community plugin setting. The community string is not accepted as a tool argument.");
  if (config.offline && true) {
    throw new Error("Air-gapped mode refuses live SNMP. Pass a captured response through tests, or unset HWOPS_OFFLINE on the management network.");
  }
  const bindings = await snmpGet({
    host,
    community: config.snmpCommunity,
    oids: [SNMP_OIDS.sysDescr, SNMP_OIDS.sysName]});
  return {
    note: "SNMPv2c read of sysDescr and sysName. Outlet and phase readings are vendor-MIB specific and are not inferred when those OIDs were not queried.",
    host,
    bindings
  };
}
async function membersOf(http, config, url, headers) {
  const body = await getJson(http, config, url, headers);
  const members = Array.isArray(body.Members) ? body.Members : [];
  const out = [];
  for (const member of members) {
    const record = member;
    const link = typeof record["@odata.id"] === "string" ? record["@odata.id"] : void 0;
    if (link && Object.keys(record).length === 1) {
      out.push(await getJson(http, config, new URL(link, url).toString(), headers));
    } else {
      out.push(record);
    }
  }
  return out;
}
async function getJson(http, config, url, headers) {
  assertOnline(config, url);
  const res = await http({ url, headers, tlsVerify: config.tlsVerify });
  if (res.status >= 400) throw new Error(`Redfish PDU GET ${url} returned HTTP ${res.status}.`);
  return JSON.parse(textBody(res));
}
function reading(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "Reading" in value) {
    const readingValue = value.Reading;
    return typeof readingValue === "number" ? readingValue : void 0;
  }
  return void 0;
}
function numberish(value) {
  return typeof value === "number" ? value : void 0;
}

export { pullSnmpPdu as a, pullRedfishPdu as p };
