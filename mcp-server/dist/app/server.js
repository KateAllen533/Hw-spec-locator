import { M as McpServer } from '../vendor/modelcontextprotocol-sdk.js';
import path from 'node:path';
import { f as fromSpec, a as fromRedfish, b as fromOneView, c as fromOme, t as toCsv } from './cmdb/normalize.js';
import { s as serviceNowPayload, a as serviceNowTable, n as netboxPlan, b as syncServiceNow, c as syncNetbox } from './cmdb/targets.js';
import { l as loadConfig, r as readPluginVersion } from './config.js';
import { g as guardedClient, n as nodeHttpClient } from './http.js';
import { l as listOmeDevices } from './integrations/ome.js';
import { l as listOneViewHardware } from './integrations/oneview.js';
import { a as applyRendered } from './net/apply.js';
import { m as mapRailCabling } from './net/cabling.js';
import { s as structuralDiff, u as unifiedDiff } from './net/diff.js';
import { r as renderConfig } from './net/render.js';
import { v as validateIntent } from './net/validate.js';
import { a as analyzePower } from './power/analyze.js';
import { p as pullRedfishPdu, a as pullSnmpPdu } from './power/pdu.js';
import { R as RedfishClient } from './redfish/client.js';
import { r as redfishBase } from './redfish/endpoint.js';
import { l as loadCatalog } from './specs/load.js';
import { s as searchProducts, g as getProduct, c as collectSources, b as compareProducts } from './specs/query.js';
import { a as asText, b as asError } from './tool-result.js';
import { s as searchUpdates, l as loadSources, f as fetchSource, m as mergeFetch, w as writeCache, r as readCache } from './updates/fetch.js';
import { i as importLocalCatalog } from './updates/import-local.js';
import { e as exportBundle, v as verifyBundle } from './updates/bundle.js';
import { R as RateLimiter } from './updates/robots.js';
import { o as object, c as array, s as string, n as number, d as boolean, _ as _enum, r as record, b as unknown } from '../vendor/zod/v4/classic/schemas.js';

const fabricSchema = object({
  name: string(),
  design: _enum(["access-vlan", "ai-rail", "evpn-vxlan", "storage", "oob"]),
  nos: _enum(["aos-cx", "os10", "sonic", "cumulus-nvue", "junos"]),
  deviceModel: string().optional(),
  hostname: string(),
  vlans: array(object({ id: number(), name: string(), description: string().optional() })),
  interfaces: array(
    object({
      name: string(),
      description: string().optional(),
      role: _enum(["server", "gpu-rail", "storage", "frontend", "oob", "isl", "keepalive", "uplink", "unused"]),
      mode: _enum(["access", "trunk", "routed", "unused"]),
      accessVlan: number().optional(),
      trunkVlans: array(number()).optional(),
      nativeVlan: number().optional(),
      mtu: number().optional(),
      lag: string().optional(),
      rail: number().optional(),
      server: string().optional(),
      serverNic: string().optional(),
      roce: boolean().optional()
    })
  ),
  lags: array(
    object({
      id: string(),
      members: array(string()),
      lacp: boolean(),
      mode: _enum(["access", "trunk"]),
      accessVlan: number().optional(),
      trunkVlans: array(number()).optional(),
      mtu: number().optional(),
      purpose: _enum(["server", "isl", "uplink", "storage"]).optional()
    })
  ).optional(),
  mlag: object({
    kind: _enum(["vsx", "vlt"]),
    domainId: number().optional(),
    role: _enum(["primary", "secondary"]).optional(),
    systemMac: string().optional(),
    islLag: string().optional(),
    keepalivePeer: string().optional(),
    keepaliveSource: string().optional(),
    keepaliveVrf: string().optional(),
    discoveryInterfaces: array(string()).optional(),
    backupDestination: string().optional()
  }).optional(),
  evpn: object({
    asn: number(),
    routerId: string(),
    loopback: string(),
    neighbors: array(object({ ip: string(), asn: number() })),
    vnis: array(object({ vni: number(), vlan: number() }))
  }).optional(),
  roce: object({
    enabled: boolean(),
    pfcPriorities: array(number()),
    ecnMinKb: number().optional(),
    ecnMaxKb: number().optional(),
    ecnProbabilityPercent: number().optional(),
    dcqcn: boolean().optional(),
    mtu: number()
  }).optional(),
  rails: array(
    object({
      rail: number(),
      leaf: string(),
      links: array(object({ server: string(), nic: string(), switchPort: string() }))
    })
  ).optional()
});
const powerPlanSchema = object({
  racks: array(object({ id: string(), name: string(), site: string().optional() })),
  pdus: array(
    object({
      id: string(),
      name: string(),
      rackId: string(),
      feed: string(),
      ratedWatts: number().optional(),
      vendor: string().optional(),
      model: string().optional(),
      phases: array(
        object({
          id: string(),
          voltage: number().optional(),
          ratedAmps: number().optional(),
          ratedWatts: number().optional(),
          circuitId: string().optional()
        })
      ),
      outlets: array(object({ id: string(), name: string(), phaseId: string(), ratedWatts: number().optional() }))
    })
  ),
  devices: array(
    object({
      id: string(),
      name: string(),
      rackId: string(),
      specId: string().optional(),
      loadWatts: number().optional(),
      psus: array(object({ id: string(), outletId: string().optional() }))
    })
  )
});
function createServer(deps = {}) {
  const config = deps.config ?? loadConfig();
  const http = deps.http ?? guardedClient(config, nodeHttpClient());
  const server = new McpServer({ name: "hw-spec-locator", version: readPluginVersion(config.pluginRoot) });
  const catalog = () => loadCatalog(config.specDir);
  const cache = () => readCache(config.cachePath);
  server.registerTool(
    "spec_search",
    {
      title: "Search hardware specs",
      description: "Search the sourced HPE and Dell hardware catalog by model, vendor, category, or AI Factory role. Numeric fields carry verification and source ids. This does not invent specifications.",
      inputSchema: object({
        query: string().optional(),
        vendor: string().optional(),
        category: _enum(["server", "storage", "network"]).optional(),
        aiFactory: boolean().optional(),
        limit: number().int().min(1).max(100).optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async (args) => {
      try {
        const data = catalog();
        const products = searchProducts(data, args).map((product) => ({
          id: product.id,
          vendor: product.vendor,
          family: product.family,
          model: product.model,
          category: product.category,
          aiFactory: product.aiFactory,
          summary: product.summary
        }));
        return asText({ count: products.length, products });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "spec_get",
    {
      title: "Get a hardware spec",
      description: "Return one catalog product, its claims, reference configurations, firmware baseline status, and source records. Unavailable fields are null.",
      inputSchema: object({ id: string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => {
      try {
        const data = catalog();
        const product = getProduct(data, id);
        if (!product) return asError(new Error(`No catalog product matches ${id}.`));
        return asText({ product, sources: collectSources(data, product) });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "spec_compare",
    {
      title: "Compare hardware specs",
      description: "Compare two or more catalog products. Treat only verified claims as confirmed.",
      inputSchema: object({ ids: array(string()).min(2) }),
      annotations: { readOnlyHint: true }
    },
    async ({ ids }) => {
      try {
        return asText(compareProducts(catalog(), ids));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "spec_baselines",
    {
      title: "Firmware and driver baseline status",
      description: "Join a product with firmware or driver records actually retrieved into the local cache. Does not label the newest package as a vendor recommendation, and never synthesizes a version.",
      inputSchema: object({ id: string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => {
      try {
        const data = catalog();
        const product = getProduct(data, id);
        if (!product) return asError(new Error(`No catalog product matches ${id}.`));
        const records = searchUpdates(cache(), product.model);
        return asText({
          productId: product.id,
          starterBaseline: product.firmwareBaseline,
          retrieved: records,
          guidance: "Retrieved records are catalog entries. They are a vendor-certified baseline only when the source itself is a validated stack such as an HPE SPP or a Dell solution catalog. This tool does not promote the newest version to recommended."
        });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "spec_coverage",
    {
      title: "Catalog coverage",
      description: "Show which requested HPE and Dell families are in the starter dataset and which were left out because a primary source was not captured.",
      inputSchema: object({}),
      annotations: { readOnlyHint: true }
    },
    async () => {
      try {
        const data = catalog();
        return asText({ coverage: data.coverage, solutions: data.solutions });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "redfish_inventory",
    {
      title: "Redfish inventory",
      description: "Read-only DMTF Redfish collection for an HPE iLO or Dell iDRAC: service root, system identity, serial, health, processors, memory, storage, NICs, and firmware inventory. Account material comes from the redfish_username and redfish_password plugin settings and is sent only to the iLO or iDRAC host named by the operator.",
      inputSchema: object({ host: string() }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ host }) => {
      try {
        if (!config.redfishUser || !config.redfishAuth) {
          return asError(new Error("Provide the redfish_username and redfish_password plugin settings."));
        }
        const client = new RedfishClient(http, redfishBase(host), config.redfishUser, config.redfishAuth, config);
        await client.login();
        return asText(await client.collect());
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "oneview_inventory",
    {
      title: "HPE OneView inventory",
      description: "Read-only HPE OneView server-hardware list. The API version is taken from /rest/version unless the oneview_api_version plugin setting is present. Account material is the oneview_username and oneview_password plugin settings, sent only to the OneView host the operator named.",
      inputSchema: object({ host: string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ host }) => {
      try {
        return asText(await listOneViewHardware(config, http, host));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "ome_inventory",
    {
      title: "Dell OpenManage Enterprise inventory",
      description: "Read-only Dell OpenManage Enterprise device list. Credentials are the ome_username and ome_password plugin settings.",
      inputSchema: object({ host: string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ host }) => {
      try {
        return asText(await listOmeDevices(config, http, host));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "cmdb_normalize",
    {
      title: "Normalize an asset",
      description: "Normalize a Redfish system, OneView server, OpenManage device, or spec id into the hwops.cmdb.v1 schema.",
      inputSchema: object({
        kind: _enum(["redfish", "oneview", "ome", "spec"]),
        payload: record(string(), unknown()).optional(),
        specId: string().optional(),
        name: string().optional(),
        serial: string().optional(),
        managementIp: string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async (args) => {
      try {
        if (args.kind === "spec") {
          if (!args.specId) return asError(new Error("specId is required."));
          return asText(fromSpec(catalog(), args.specId, { name: args.name, serial: args.serial }));
        }
        if (!args.payload) return asError(new Error("payload is required."));
        if (args.kind === "redfish") {
          return asText(fromRedfish(args.payload, { name: args.name, managementIp: args.managementIp }));
        }
        if (args.kind === "oneview") return asText(fromOneView(args.payload));
        return asText(fromOme(args.payload));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "cmdb_export",
    {
      title: "Export CMDB records",
      description: "Export normalized assets as JSON or CSV. This writes nothing to a CMDB.",
      inputSchema: object({
        format: _enum(["json", "csv"]),
        assets: array(record(string(), unknown()))
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ format, assets }) => {
      try {
        const typed = assets;
        return asText(format === "csv" ? { format, body: toCsv(typed) } : { format, assets: typed });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "cmdb_preview",
    {
      title: "Preview CMDB sync",
      description: "Build ServiceNow table payloads or NetBox device, interface, and power-port payloads without calling those APIs.",
      inputSchema: object({
        target: _enum(["servicenow", "netbox"]),
        assets: array(record(string(), unknown()))
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ target, assets }) => {
      try {
        const typed = assets;
        if (target === "servicenow") {
          return asText({
            target,
            payloads: typed.map((asset) => ({ table: serviceNowTable(asset), body: serviceNowPayload(asset) }))
          });
        }
        return asText({ target, payloads: typed.map((asset) => netboxPlan(asset)) });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "cmdb_sync",
    {
      title: "Sync CMDB records",
      description: "Create or update ServiceNow CMDB rows or NetBox devices. Refused unless HWOPS_ALLOW_WRITE=true and confirm matches HWOPS_WRITE_CONFIRM (default APPLY).",
      inputSchema: object({
        target: _enum(["servicenow", "netbox"]),
        assets: array(record(string(), unknown())),
        confirm: string()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async ({ target, assets, confirm }) => {
      try {
        const typed = assets;
        if (target === "servicenow") return asText(await syncServiceNow(config, http, typed, confirm));
        return asText(await syncNetbox(config, http, typed, confirm));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "power_analyze",
    {
      title: "Analyze rack power",
      description: "Map PSUs to PDU outlets, estimate normal and failover load from operator watts or sourced spec planning watts, and flag missing redundancy or overload. Accelerator TDP is not treated as system load unless includeComponentTdp is true.",
      inputSchema: powerPlanSchema.extend({ includeComponentTdp: boolean().optional() }),
      annotations: { readOnlyHint: true }
    },
    async ({ includeComponentTdp, ...plan }) => {
      try {
        return asText(analyzePower(plan, catalog(), { includeComponentTdp }));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "power_pull_pdu",
    {
      title: "Read a PDU",
      description: "Read-only PDU pull. protocol redfish walks PowerEquipment PowerDistribution. protocol snmp performs an SNMPv2c GET of sysDescr and sysName using the snmp_community plugin setting. It does not invent outlet readings.",
      inputSchema: object({ host: string(), protocol: _enum(["redfish", "snmp"]) }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ host, protocol }) => {
      try {
        if (protocol === "redfish") return asText({ pdus: await pullRedfishPdu(config, http, host) });
        return asText(await pullSnmpPdu(config, host));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "net_generate",
    {
      title: "Generate switch configuration",
      description: "Generate a review draft for AOS-CX, OS10, Enterprise SONiC config_db, Cumulus NVUE, or Junos from a fabric intent. VLAN, LAG, VSX, and VLT basics are pinned. RoCE QoS and EVPN CLI are marked UNVERIFIED and are not applied by default.",
      inputSchema: fabricSchema,
      annotations: { readOnlyHint: true }
    },
    async (intent) => {
      try {
        const validation = validateIntent(intent);
        const rendered = renderConfig(intent);
        return asText({ validation, rendered });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "net_validate",
    {
      title: "Validate a fabric intent",
      description: "Validate VLANs, LAG membership, RoCE parameters, rail placement, and NOS versus model. This is a structural check, not a vendor certification.",
      inputSchema: fabricSchema,
      annotations: { readOnlyHint: true }
    },
    async (intent) => {
      try {
        return asText(validateIntent(intent));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "net_diff",
    {
      title: "Diff configurations",
      description: "Unified line diff of two configuration drafts, plus a structural diff when JSON intents are supplied.",
      inputSchema: object({
        before: string(),
        after: string(),
        beforeIntent: record(string(), unknown()).optional(),
        afterIntent: record(string(), unknown()).optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ before, after, beforeIntent, afterIntent }) => {
      try {
        return asText({
          diff: unifiedDiff(before, after),
          structural: beforeIntent && afterIntent ? structuralDiff(beforeIntent, afterIntent) : null
        });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "net_map_cabling",
    {
      title: "Map server NICs to leaf ports",
      description: "Build a rail-optimized cabling plan: one rail per leaf, NIC order as the rail unless a NIC sets rail. This is a planning heuristic, not a vendor bill of materials.",
      inputSchema: object({
        servers: array(object({ name: string(), nics: array(object({ name: string(), rail: number().optional() })) })),
        leaves: array(object({ name: string(), ports: array(string()) }))
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ servers, leaves }) => {
      try {
        return asText(mapRailCabling(servers, leaves));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "net_apply",
    {
      title: "Apply pinned switch configuration",
      description: "Push pinned commands only. Refused unless HWOPS_ALLOW_WRITE=true and confirm matches. UNVERIFIED syntax is never sent. aos-cx-cli uses the AOS-CX REST login and /cli endpoint. generic-https POSTs pinned text to the switch_apply_url plugin setting.",
      inputSchema: fabricSchema.extend({
        confirm: string(),
        transport: _enum(["aos-cx-cli", "generic-https"]),
        host: string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
    },
    async ({ confirm, transport, host, ...intent }) => {
      try {
        const validation = validateIntent(intent);
        if (!validation.ok) return asError(new Error(`Intent has errors: ${validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`));
        const rendered = renderConfig(intent);
        return asText(await applyRendered({ config, http, rendered, confirm, transport, host }));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "updates_fetch",
    {
      title: "Fetch public update metadata",
      description: "Fetch configured Dell and HPE update sources. Checks robots.txt first, rate-limits per host, and records source URL plus retrieval time. Disallowed or failed sources are marked unavailable. Versions are never invented.",
      inputSchema: object({ sourceId: string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async ({ sourceId }) => {
      try {
        const sources = loadSources(path.join(path.dirname(config.cachePath), "sources.json")).filter((source) => !sourceId || source.id === sourceId);
        if (sources.length === 0) return asError(new Error(`No update source matched ${sourceId ?? "(all)"}.`));
        const limiter = new RateLimiter(config.fetchMinIntervalMs);
        let current = cache();
        const results = [];
        for (const source of sources) {
          const result = await fetchSource({ config, http, source, limiter });
          current = mergeFetch(current, result);
          results.push({ ...result, records: void 0, recordCount: result.records.length });
        }
        writeCache(config.cachePath, current);
        return asText({ results });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "updates_search",
    {
      title: "Search cached updates",
      description: "Search firmware, BIOS, driver, and package records previously fetched or imported. An empty cache means no versions are known.",
      inputSchema: object({ query: string().optional() }),
      annotations: { readOnlyHint: true }
    },
    async ({ query }) => {
      try {
        const current = cache();
        const records = searchUpdates(current, query ?? "");
        return asText({ count: records.length, fetches: current.fetches.map(({ records: _records, ...fetch }) => fetch), records });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "updates_import_local",
    {
      title: "Import a local catalog file",
      description: "Parse a Dell catalog XML or Debian Packages file you obtained yourself, copy it into the local mirror, and cache only versions the parser recognized. Use this when robots.txt disallows the Dell download site.",
      inputSchema: object({
        filePath: string(),
        vendor: string(),
        sourceId: string()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ filePath, vendor, sourceId }) => {
      try {
        const result = importLocalCatalog({ filePath, vendor, sourceId, mirrorDir: config.mirrorDir });
        const current = mergeFetch(cache(), result);
        writeCache(config.cachePath, current);
        return asText({ status: result.status, reason: result.reason, recordCount: result.records.length, retrievedAt: result.retrievedAt });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "updates_bundle_export",
    {
      title: "Export an offline bundle",
      description: "Copy specs, update cache, and the firmware mirror layout into a directory with manifest.json and SHA256SUMS. Adds signature.sig when the bundle_signing_key plugin setting contains a PEM private key. The private key is not written into the bundle.",
      inputSchema: object({ outDir: string() }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ outDir }) => {
      try {
        const current = cache();
        const manifest = exportBundle({
          pluginRoot: config.pluginRoot,
          outDir,
          signingKeyPem: config.bundleSigner,
          unavailableSources: current.fetches.filter((fetch) => fetch.status === "unavailable").map((fetch) => ({ id: fetch.sourceId, url: fetch.url, reason: fetch.reason }))
        });
        return asText({
          outDir,
          fileCount: manifest.files.length,
          signature: manifest.signature,
          note: "Carry this directory into the air-gapped site and turn on offline mode, with HWOPS_OFFLINE_BUNDLE pointing at the directory. Verify with the bundle_public_key plugin setting."
        });
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "updates_bundle_verify",
    {
      title: "Verify an offline bundle",
      description: "Recompute SHA-256 checksums. When signature.sig exists, the bundle_public_key plugin setting is required and the signature must validate. A public key shipped inside the bundle is not a trust anchor.",
      inputSchema: object({ bundleDir: string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ bundleDir }) => {
      try {
        const result = verifyBundle(bundleDir, config.bundleVerifier);
        if (!result.checksumsOk || result.signature === "invalid" || result.signature === "unchecked") {
          return asError(new Error(`${result.message} ${result.mismatches.join("; ")}`.trim()));
        }
        return asText(result);
      } catch (error) {
        return asError(error);
      }
    }
  );
  return server;
}

export { createServer as c };
