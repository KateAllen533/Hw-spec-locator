import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePower } from "../src/power/analyze.js";
import type { PowerPlan } from "../src/power/model.js";
import { pullRedfishPdu, pullSnmpPdu } from "../src/power/pdu.js";
import { decodeResponse, encodeGet } from "../src/power/snmp.js";
import { mapRailCabling } from "../src/net/cabling.js";
import { unifiedDiff } from "../src/net/diff.js";
import type { FabricIntent } from "../src/net/intent.js";
import { renderConfig } from "../src/net/render.js";
import { validateIntent } from "../src/net/validate.js";
import { applyRendered } from "../src/net/apply.js";
import { loadCatalog } from "../src/specs/load.js";
import { mockHttp, testConfig } from "./helpers.js";

function plan(overrides?: Partial<PowerPlan["devices"][number]>): PowerPlan {
  return {
    racks: [{ id: "r1", name: "Rack 1" }],
    pdus: [
      {
        id: "pdu-a",
        name: "PDU A",
        rackId: "r1",
        feed: "A",
        ratedWatts: 5000,
        phases: [{ id: "A", ratedWatts: 2000 }],
        outlets: [{ id: "a1", name: "A1", phaseId: "A" }],
      },
      {
        id: "pdu-b",
        name: "PDU B",
        rackId: "r1",
        feed: "B",
        ratedWatts: 5000,
        phases: [{ id: "A", ratedWatts: 800 }],
        outlets: [{ id: "b1", name: "B1", phaseId: "A" }],
      },
    ],
    devices: [
      {
        id: "f710-1",
        name: "f710-1",
        rackId: "r1",
        specId: "dell-powerscale-f710",
        psus: [
          { id: "PSU1", outletId: "a1" },
          { id: "PSU2", outletId: "b1" },
        ],
        ...overrides,
      },
    ],
  };
}

test("F710 failover load flags the smaller phase and keeps feed diversity", () => {
  const catalog = loadCatalog(testConfig().specDir);
  const report = analyzePower(plan(), catalog);
  const load = report.deviceLoads[0];
  assert.equal(load.watts, 887);
  assert.equal(load.provenance, "spec-planning");
  const phaseB = report.phaseLoads.find((phase) => phase.pduId === "pdu-b");
  assert.equal(phaseB?.failoverWatts, 887);
  assert.equal(phaseB?.overloadFailover, true);
  assert.equal(phaseB?.normalWatts, 443.5);
  assert.equal(report.findings.some((finding) => finding.code === "loss-of-feed-diversity"), false);
  const sameFeed = analyzePower(
    plan({
      psus: [
        { id: "PSU1", outletId: "a1" },
        { id: "PSU2", outletId: "a1" },
      ],
    }),
    catalog,
  );
  assert.ok(sameFeed.findings.some((finding) => finding.code === "loss-of-feed-diversity"));
  const netbox = report.netbox.powerPorts;
  assert.equal(netbox[0].maximum_draw, 887);
});

test("GPU accelerator TDP is omitted from rack load unless requested", () => {
  const catalog = loadCatalog(testConfig().specDir);
  const gpuPlan = plan({ id: "gpu", name: "xe", specId: "dell-poweredge-xe9680", psus: [{ id: "PSU1", outletId: "a1" }, { id: "PSU2", outletId: "b1" }] });
  const hidden = analyzePower(gpuPlan, catalog);
  assert.equal(hidden.deviceLoads[0].watts, null);
  assert.ok(hidden.findings.some((finding) => finding.code === "load-unknown"));
  const shown = analyzePower(gpuPlan, catalog, { includeComponentTdp: true });
  assert.equal(shown.deviceLoads[0].watts, 5600);
  assert.equal(shown.deviceLoads[0].incomplete, true);
});

test("Redfish PDU and SNMP mocks", async () => {
  const http = mockHttp((req) => {
    const path = new URL(req.url).pathname;
    if (req.method === "POST") return { status: 201, headers: { "x-auth-token": "pdu" }, body: {} };
    if (path.endsWith("/PowerDistribution")) {
      return { body: { Members: [{ "@odata.id": "/redfish/v1/PowerEquipment/PowerDistribution/1" }] } };
    }
    if (path.endsWith("/PowerDistribution/1")) {
      return {
        body: {
          Id: "1",
          Name: "Rack PDU",
          Manufacturer: "Example",
          Model: "PDU-1",
          Branches: { "@odata.id": "/redfish/v1/PowerEquipment/PowerDistribution/1/Branches" },
          Outlets: { "@odata.id": "/redfish/v1/PowerEquipment/PowerDistribution/1/Outlets" },
        },
      };
    }
    if (path.endsWith("/Branches")) return { body: { Members: [{ Id: "A", NominalVoltage: { Reading: 208 }, RatedCurrentAmps: 24 }] } };
    if (path.endsWith("/Outlets")) return { body: { Members: [{ Id: "1", Name: "Outlet 1", PhaseWiringType: "A" }] } };
    return { status: 404, body: {} };
  });
  const pdus = await pullRedfishPdu(testConfig({ redfishUsername: "u", redfishPassword: "p" }), http, "pdu.example");
  assert.equal(pdus[0].name, "Rack PDU");
  assert.equal(pdus[0].phases[0].voltage, 208);
  assert.equal(pdus[0].outlets[0].phaseId, "A");

  const response = encodeGetResponse();
  const snmp = await pullSnmpPdu(testConfig({ snmpCommunity: "lab-read" }), "pdu.example", async () => response);
  assert.equal(snmp.bindings[0].value, "Example PDU");
  await assert.rejects(() => pullSnmpPdu(testConfig({ offline: true, snmpCommunity: "lab-read" }), "pdu.example"), /Air-gapped/);
});

test("rail cabling, RoCE validation, and pinned AOS-CX versus unverified QoS", () => {
  const cabling = mapRailCabling(
    [
      { name: "gpu01", nics: [{ name: "gpu0" }, { name: "gpu1" }] },
      { name: "gpu02", nics: [{ name: "gpu0" }, { name: "gpu1" }] },
    ],
    [
      { name: "leaf-b", ports: ["1/1/1", "1/1/2"] },
      { name: "leaf-a", ports: ["1/1/1", "1/1/2"] },
    ],
  );
  assert.equal(cabling.rails[0].leaf, "leaf-a");
  assert.deepEqual(
    cabling.links.filter((link) => link.rail === 0).map((link) => link.leaf),
    ["leaf-a", "leaf-a"],
  );
  const intent: FabricIntent = {
    name: "rail0",
    design: "ai-rail",
    nos: "aos-cx",
    deviceModel: "hpe-aruba-cx-9300-32d",
    hostname: "leaf-a",
    vlans: [{ id: 100, name: "gpu" }],
    interfaces: [
      { name: "1/1/1", role: "gpu-rail", mode: "access", accessVlan: 100, rail: 0, server: "gpu01", serverNic: "gpu0", roce: true, mtu: 9216 },
      { name: "1/1/49", role: "isl", mode: "trunk", trunkVlans: [100], lag: "lag256" },
    ],
    lags: [{ id: "lag256", members: ["1/1/49"], lacp: true, mode: "trunk", trunkVlans: [100], purpose: "isl" }],
    mlag: { kind: "vsx", role: "primary", islLag: "lag256", keepalivePeer: "192.0.2.2", keepaliveSource: "192.0.2.1", systemMac: "02:00:00:00:00:01" },
    roce: { enabled: true, pfcPriorities: [3], ecnMinKb: 100, ecnMaxKb: 500, ecnProbabilityPercent: 5, dcqcn: true, mtu: 9216 },
  };
  const validation = validateIntent(intent);
  assert.equal(validation.ok, true);
  assert.ok(validation.issues.some((issue) => issue.code === "roce-cli-unverified"));
  const rendered = renderConfig(intent);
  assert.match(rendered.reviewDraft, /vlan access 100/);
  assert.match(rendered.reviewDraft, /inter-switch-link lag 256/);
  assert.match(rendered.reviewDraft, /UNVERIFIED/);
  assert.ok(rendered.pinnedCommands.some((line) => line.includes("vlan access 100")));
  assert.equal(rendered.pinnedCommands.some((line) => line.includes("PFC")), false);
  const broken = validateIntent({ ...intent, roce: { ...intent.roce!, ecnMinKb: 800, ecnMaxKb: 100, pfcPriorities: [3, 3] } });
  assert.equal(broken.ok, false);
  const os10 = renderConfig({ ...intent, nos: "os10", mlag: { kind: "vlt", domainId: 1, backupDestination: "192.0.2.2", discoveryInterfaces: ["ethernet1/1/48"] }, deviceModel: undefined });
  assert.match(os10.reviewDraft, /vlt-domain 1/);
  const sonic = renderConfig({ ...intent, nos: "sonic", mlag: undefined, deviceModel: "dell-powerswitch-z9864f-on" });
  assert.match(sonic.pinnedCommands[0], /Vlan100/);
  const diff = unifiedDiff("vlan 100\n", "vlan 200\n");
  assert.match(diff, /-vlan 100/);
  assert.match(diff, /\+vlan 200/);
  const wrongNos = validateIntent({ ...intent, nos: "os10", deviceModel: "dell-powerswitch-z9864f-on", mlag: undefined });
  assert.ok(wrongNos.issues.some((issue) => issue.code === "nos-model"));
});

test("apply sends only pinned AOS-CX commands and stays closed by default", async () => {
  const intent: FabricIntent = {
    name: "access",
    design: "access-vlan",
    nos: "aos-cx",
    hostname: "leaf1",
    vlans: [{ id: 10, name: "web" }],
    interfaces: [{ name: "1/1/1", role: "server", mode: "access", accessVlan: 10 }],
  };
  const rendered = renderConfig(intent);
  const calls: string[] = [];
  const http = mockHttp((req) => {
    calls.push(new URL(req.url).pathname);
    if (req.url.endsWith("/login")) return { status: 200, headers: { "set-cookie": "session=1" }, body: {} };
    return { status: 200, body: { status: "ok" } };
  });
  await assert.rejects(() => applyRendered({ config: testConfig(), http, rendered, confirm: "APPLY", transport: "aos-cx-cli", host: "switch.example" }), /read-only|ALLOW_WRITE/i);
  const roce = renderConfig({ ...intent, roce: { enabled: true, pfcPriorities: [3], mtu: 9216 }, interfaces: [{ ...intent.interfaces[0], roce: true, mtu: 9216 }] });
  await assert.rejects(
    () => applyRendered({ config: testConfig({ allowWrite: true, switchUsername: "admin", switchPassword: "pw" }), http, rendered: roce, confirm: "APPLY", transport: "aos-cx-cli", host: "switch.example" }),
    /UNVERIFIED/,
  );
  await applyRendered({
    config: testConfig({ allowWrite: true, switchUsername: "admin", switchPassword: "pw", aoscxApiVersion: "v10.13" }),
    http,
    rendered,
    confirm: "APPLY",
    transport: "aos-cx-cli",
    host: "switch.example",
  });
  assert.ok(calls.includes("/rest/v10.13/login"));
  assert.ok(calls.includes("/rest/v10.13/cli"));
});

function encodeGetResponse(): Buffer {
  const request = encodeGet("lab-read", 7, ["1.3.6.1.2.1.1.1.0"]);
  const decodedProbe = decodeResponse(rewritePdu(request));
  assert.equal(decodedProbe.length >= 0, true);
  return rewritePdu(request, Buffer.from("Example PDU"));
}

function rewritePdu(request: Buffer, value?: Buffer): Buffer {
  const { read } = berHelpers();
  const message = read(request, 0);
  let offset = 0;
  offset += read(message.value, offset).byteLength;
  offset += read(message.value, offset).byteLength;
  const pdu = read(message.value, offset);
  let pduOffset = 0;
  const requestId = read(pdu.value, pduOffset);
  pduOffset += requestId.byteLength;
  pduOffset += read(pdu.value, pduOffset).byteLength;
  pduOffset += read(pdu.value, pduOffset).byteLength;
  const vbl = read(pdu.value, pduOffset);
  const bind = read(vbl.value, 0);
  const oid = read(bind.value, 0);
  const octet = value ? tlv(0x04, value) : Buffer.from([0x05, 0x00]);
  const newBind = tlv(0x30, Buffer.concat([oid.bytes, octet]));
  const newVbl = tlv(0x30, newBind);
  const newPdu = tlv(0xa2, Buffer.concat([requestId.bytes, tlv(0x02, Buffer.from([0])), tlv(0x02, Buffer.from([0])), newVbl]));
  const version = read(message.value, 0);
  const community = read(message.value, version.byteLength);
  return tlv(0x30, Buffer.concat([version.bytes, community.bytes, newPdu]));
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), Buffer.from([value.length]), value]);
}

function berHelpers() {
  function read(buffer: Buffer, offset: number) {
    const tag = buffer[offset];
    const length = buffer[offset + 1];
    const start = offset + 2;
    return { tag, value: buffer.subarray(start, start + length), byteLength: 2 + length, bytes: buffer.subarray(offset, start + length) };
  }
  return { read };
}
