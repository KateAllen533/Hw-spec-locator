import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { fromOme, fromOneView, fromRedfish, fromSpec, toCsv } from "./cmdb/normalize.js";
import { netboxPlan, serviceNowPayload, serviceNowTable, syncNetbox, syncServiceNow } from "./cmdb/targets.js";
import type { CmdbAsset } from "./cmdb/model.js";
import { loadConfig, type HwopsConfig } from "./config.js";
import { guardedClient, nodeHttpClient, type HttpClient } from "./http.js";
import { listOmeDevices } from "./integrations/ome.js";
import { listOneViewHardware } from "./integrations/oneview.js";
import { applyRendered } from "./net/apply.js";
import { mapRailCabling } from "./net/cabling.js";
import { structuralDiff, unifiedDiff } from "./net/diff.js";
import type { FabricIntent } from "./net/intent.js";
import { renderConfig } from "./net/render.js";
import { validateIntent } from "./net/validate.js";
import { analyzePower } from "./power/analyze.js";
import type { PowerPlan } from "./power/model.js";
import { pullRedfishPdu, pullSnmpPdu } from "./power/pdu.js";
import { RedfishClient, redfishBase } from "./redfish/client.js";
import { loadCatalog } from "./specs/load.js";
import { collectSources, compareProducts, getProduct, searchProducts } from "./specs/query.js";
import { asError, asText } from "./tool-result.js";
import { readCache, fetchSource, loadSources, mergeFetch, searchUpdates, writeCache } from "./updates/fetch.js";
import { importLocalCatalog } from "./updates/import-local.js";
import { exportBundle, verifyBundle } from "./updates/bundle.js";
import { RateLimiter } from "./updates/robots.js";

const fabricSchema = z.object({
  name: z.string(),
  design: z.enum(["access-vlan", "ai-rail", "evpn-vxlan", "storage", "oob"]),
  nos: z.enum(["aos-cx", "os10", "sonic", "cumulus-nvue", "junos"]),
  deviceModel: z.string().optional(),
  hostname: z.string(),
  vlans: z.array(z.object({ id: z.number(), name: z.string(), description: z.string().optional() })),
  interfaces: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      role: z.enum(["server", "gpu-rail", "storage", "frontend", "oob", "isl", "keepalive", "uplink", "unused"]),
      mode: z.enum(["access", "trunk", "routed", "unused"]),
      accessVlan: z.number().optional(),
      trunkVlans: z.array(z.number()).optional(),
      nativeVlan: z.number().optional(),
      mtu: z.number().optional(),
      lag: z.string().optional(),
      rail: z.number().optional(),
      server: z.string().optional(),
      serverNic: z.string().optional(),
      roce: z.boolean().optional(),
    }),
  ),
  lags: z
    .array(
      z.object({
        id: z.string(),
        members: z.array(z.string()),
        lacp: z.boolean(),
        mode: z.enum(["access", "trunk"]),
        accessVlan: z.number().optional(),
        trunkVlans: z.array(z.number()).optional(),
        mtu: z.number().optional(),
        purpose: z.enum(["server", "isl", "uplink", "storage"]).optional(),
      }),
    )
    .optional(),
  mlag: z
    .object({
      kind: z.enum(["vsx", "vlt"]),
      domainId: z.number().optional(),
      role: z.enum(["primary", "secondary"]).optional(),
      systemMac: z.string().optional(),
      islLag: z.string().optional(),
      keepalivePeer: z.string().optional(),
      keepaliveSource: z.string().optional(),
      keepaliveVrf: z.string().optional(),
      discoveryInterfaces: z.array(z.string()).optional(),
      backupDestination: z.string().optional(),
    })
    .optional(),
  evpn: z
    .object({
      asn: z.number(),
      routerId: z.string(),
      loopback: z.string(),
      neighbors: z.array(z.object({ ip: z.string(), asn: z.number() })),
      vnis: z.array(z.object({ vni: z.number(), vlan: z.number() })),
    })
    .optional(),
  roce: z
    .object({
      enabled: z.boolean(),
      pfcPriorities: z.array(z.number()),
      ecnMinKb: z.number().optional(),
      ecnMaxKb: z.number().optional(),
      ecnProbabilityPercent: z.number().optional(),
      dcqcn: z.boolean().optional(),
      mtu: z.number(),
    })
    .optional(),
  rails: z
    .array(
      z.object({
        rail: z.number(),
        leaf: z.string(),
        links: z.array(z.object({ server: z.string(), nic: z.string(), switchPort: z.string() })),
      }),
    )
    .optional(),
});

const powerPlanSchema = z.object({
  racks: z.array(z.object({ id: z.string(), name: z.string(), site: z.string().optional() })),
  pdus: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rackId: z.string(),
      feed: z.string(),
      ratedWatts: z.number().optional(),
      vendor: z.string().optional(),
      model: z.string().optional(),
      phases: z.array(
        z.object({
          id: z.string(),
          voltage: z.number().optional(),
          ratedAmps: z.number().optional(),
          ratedWatts: z.number().optional(),
          circuitId: z.string().optional(),
        }),
      ),
      outlets: z.array(z.object({ id: z.string(), name: z.string(), phaseId: z.string(), ratedWatts: z.number().optional() })),
    }),
  ),
  devices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rackId: z.string(),
      specId: z.string().optional(),
      loadWatts: z.number().optional(),
      psus: z.array(z.object({ id: z.string(), outletId: z.string().optional() })),
    }),
  ),
});

export interface ServerDeps {
  config?: HwopsConfig;
  http?: HttpClient;
}

export function createServer(deps: ServerDeps = {}): McpServer {
  const config = deps.config ?? loadConfig();
  const http = deps.http ?? guardedClient(config, nodeHttpClient());
  const server = new McpServer({ name: "hpe-dell-hwops", version: "1.0.0" });

  const catalog = () => loadCatalog(config.specDir);
  const cache = () => readCache(config.cachePath);

  server.registerTool(
    "spec_search",
    {
      title: "Search hardware specs",
      description: "Search the sourced HPE and Dell hardware catalog by model, vendor, category, or AI Factory role. Numeric fields carry verification and source ids. This does not invent specifications.",
      inputSchema: z.object({
        query: z.string().optional(),
        vendor: z.string().optional(),
        category: z.enum(["server", "storage", "network"]).optional(),
        aiFactory: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true },
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
          summary: product.summary,
        }));
        return asText({ count: products.length, products });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "spec_get",
    {
      title: "Get a hardware spec",
      description: "Return one catalog product, its claims, reference configurations, firmware baseline status, and source records. Unavailable fields are null.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true },
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
    },
  );

  server.registerTool(
    "spec_compare",
    {
      title: "Compare hardware specs",
      description: "Compare two or more catalog products. Treat only verified claims as confirmed.",
      inputSchema: z.object({ ids: z.array(z.string()).min(2) }),
      annotations: { readOnlyHint: true },
    },
    async ({ ids }) => {
      try {
        return asText(compareProducts(catalog(), ids));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "spec_baselines",
    {
      title: "Firmware and driver baseline status",
      description: "Join a product with firmware or driver records actually retrieved into the local cache. Does not label the newest package as a vendor recommendation, and never synthesizes a version.",
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true },
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
          guidance:
            "Retrieved records are catalog entries. They are a vendor-certified baseline only when the source itself is a validated stack such as an HPE SPP or a Dell solution catalog. This tool does not promote the newest version to recommended.",
        });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "spec_coverage",
    {
      title: "Catalog coverage",
      description: "Show which requested HPE and Dell families are in the starter dataset and which were left out because a primary source was not captured.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const data = catalog();
        return asText({ coverage: data.coverage, solutions: data.solutions });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "redfish_inventory",
    {
      title: "Redfish inventory",
      description: "Read-only DMTF Redfish collection for an HPE iLO or Dell iDRAC: service root, system identity, serial, health, processors, memory, storage, NICs, and firmware inventory. Credentials come from HWOPS_REDFISH_USERNAME and HWOPS_REDFISH_PASSWORD.",
      inputSchema: z.object({ host: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ host }) => {
      try {
        if (!config.redfishUsername || !config.redfishPassword) {
          return asError(new Error("Set HWOPS_REDFISH_USERNAME and HWOPS_REDFISH_PASSWORD."));
        }
        const client = new RedfishClient(http, redfishBase(host), config.redfishUsername, config.redfishPassword, config);
        await client.login();
        return asText(await client.collect());
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "oneview_inventory",
    {
      title: "HPE OneView inventory",
      description: "Read-only HPE OneView server-hardware list. The API version is taken from /rest/version unless HWOPS_ONEVIEW_API_VERSION is set. Credentials are environment variables.",
      inputSchema: z.object({ host: z.string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ host }) => {
      try {
        return asText(await listOneViewHardware(config, http, host));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "ome_inventory",
    {
      title: "Dell OpenManage Enterprise inventory",
      description: "Read-only Dell OpenManage Enterprise device list. Credentials are HWOPS_OME_USERNAME and HWOPS_OME_PASSWORD.",
      inputSchema: z.object({ host: z.string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ host }) => {
      try {
        return asText(await listOmeDevices(config, http, host));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "cmdb_normalize",
    {
      title: "Normalize an asset",
      description: "Normalize a Redfish system, OneView server, OpenManage device, or spec id into the hwops.cmdb.v1 schema.",
      inputSchema: z.object({
        kind: z.enum(["redfish", "oneview", "ome", "spec"]),
        payload: z.record(z.string(), z.unknown()).optional(),
        specId: z.string().optional(),
        name: z.string().optional(),
        serial: z.string().optional(),
        managementIp: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        if (args.kind === "spec") {
          if (!args.specId) return asError(new Error("specId is required."));
          return asText(fromSpec(catalog(), args.specId, { name: args.name, serial: args.serial }));
        }
        if (!args.payload) return asError(new Error("payload is required."));
        if (args.kind === "redfish") {
          return asText(fromRedfish(args.payload as unknown as Parameters<typeof fromRedfish>[0], { name: args.name, managementIp: args.managementIp }));
        }
        if (args.kind === "oneview") return asText(fromOneView(args.payload));
        return asText(fromOme(args.payload));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "cmdb_export",
    {
      title: "Export CMDB records",
      description: "Export normalized assets as JSON or CSV. This writes nothing to a CMDB.",
      inputSchema: z.object({
        format: z.enum(["json", "csv"]),
        assets: z.array(z.record(z.string(), z.unknown())),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ format, assets }) => {
      try {
        const typed = assets as unknown as CmdbAsset[];
        return asText(format === "csv" ? { format, body: toCsv(typed) } : { format, assets: typed });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "cmdb_preview",
    {
      title: "Preview CMDB sync",
      description: "Build ServiceNow table payloads or NetBox device, interface, and power-port payloads without calling those APIs.",
      inputSchema: z.object({
        target: z.enum(["servicenow", "netbox"]),
        assets: z.array(z.record(z.string(), z.unknown())),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ target, assets }) => {
      try {
        const typed = assets as unknown as CmdbAsset[];
        if (target === "servicenow") {
          return asText({
            target,
            payloads: typed.map((asset) => ({ table: serviceNowTable(asset), body: serviceNowPayload(asset) })),
          });
        }
        return asText({ target, payloads: typed.map((asset) => netboxPlan(asset)) });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "cmdb_sync",
    {
      title: "Sync CMDB records",
      description: "Create or update ServiceNow CMDB rows or NetBox devices. Refused unless HWOPS_ALLOW_WRITE=true and confirm matches HWOPS_WRITE_CONFIRM (default APPLY).",
      inputSchema: z.object({
        target: z.enum(["servicenow", "netbox"]),
        assets: z.array(z.record(z.string(), z.unknown())),
        confirm: z.string(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ target, assets, confirm }) => {
      try {
        const typed = assets as unknown as CmdbAsset[];
        if (target === "servicenow") return asText(await syncServiceNow(config, http, typed, confirm));
        return asText(await syncNetbox(config, http, typed, confirm));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "power_analyze",
    {
      title: "Analyze rack power",
      description: "Map PSUs to PDU outlets, estimate normal and failover load from operator watts or sourced spec planning watts, and flag missing redundancy or overload. Accelerator TDP is not treated as system load unless includeComponentTdp is true.",
      inputSchema: powerPlanSchema.extend({ includeComponentTdp: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ includeComponentTdp, ...plan }) => {
      try {
        return asText(analyzePower(plan as PowerPlan, catalog(), { includeComponentTdp }));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "power_pull_pdu",
    {
      title: "Read a PDU",
      description: "Read-only PDU pull. protocol redfish walks PowerEquipment PowerDistribution. protocol snmp performs an SNMPv2c GET of sysDescr and sysName using HWOPS_SNMP_COMMUNITY. It does not invent outlet readings.",
      inputSchema: z.object({ host: z.string(), protocol: z.enum(["redfish", "snmp"]) }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ host, protocol }) => {
      try {
        if (protocol === "redfish") return asText({ pdus: await pullRedfishPdu(config, http, host) });
        return asText(await pullSnmpPdu(config, host));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "net_generate",
    {
      title: "Generate switch configuration",
      description: "Generate a review draft for AOS-CX, OS10, Enterprise SONiC config_db, Cumulus NVUE, or Junos from a fabric intent. VLAN, LAG, VSX, and VLT basics are pinned. RoCE QoS and EVPN CLI are marked UNVERIFIED and are not applied by default.",
      inputSchema: fabricSchema,
      annotations: { readOnlyHint: true },
    },
    async (intent) => {
      try {
        const validation = validateIntent(intent as FabricIntent);
        const rendered = renderConfig(intent as FabricIntent);
        return asText({ validation, rendered });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "net_validate",
    {
      title: "Validate a fabric intent",
      description: "Validate VLANs, LAG membership, RoCE parameters, rail placement, and NOS versus model. This is a structural check, not a vendor certification.",
      inputSchema: fabricSchema,
      annotations: { readOnlyHint: true },
    },
    async (intent) => {
      try {
        return asText(validateIntent(intent as FabricIntent));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "net_diff",
    {
      title: "Diff configurations",
      description: "Unified line diff of two configuration drafts, plus a structural diff when JSON intents are supplied.",
      inputSchema: z.object({
        before: z.string(),
        after: z.string(),
        beforeIntent: z.record(z.string(), z.unknown()).optional(),
        afterIntent: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ before, after, beforeIntent, afterIntent }) => {
      try {
        return asText({
          diff: unifiedDiff(before, after),
          structural: beforeIntent && afterIntent ? structuralDiff(beforeIntent, afterIntent) : null,
        });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "net_map_cabling",
    {
      title: "Map server NICs to leaf ports",
      description: "Build a rail-optimized cabling plan: one rail per leaf, NIC order as the rail unless a NIC sets rail. This is a planning heuristic, not a vendor bill of materials.",
      inputSchema: z.object({
        servers: z.array(z.object({ name: z.string(), nics: z.array(z.object({ name: z.string(), rail: z.number().optional() })) })),
        leaves: z.array(z.object({ name: z.string(), ports: z.array(z.string()) })),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ servers, leaves }) => {
      try {
        return asText(mapRailCabling(servers, leaves));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "net_apply",
    {
      title: "Apply pinned switch configuration",
      description: "Push pinned commands only. Refused unless HWOPS_ALLOW_WRITE=true and confirm matches. UNVERIFIED syntax is never sent. aos-cx-cli uses the AOS-CX REST login and /cli endpoint. generic-https POSTs pinned text to HWOPS_SWITCH_APPLY_URL.",
      inputSchema: fabricSchema.extend({
        confirm: z.string(),
        transport: z.enum(["aos-cx-cli", "generic-https"]),
        host: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ confirm, transport, host, ...intent }) => {
      try {
        const validation = validateIntent(intent as FabricIntent);
        if (!validation.ok) return asError(new Error(`Intent has errors: ${validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`));
        const rendered = renderConfig(intent as FabricIntent);
        return asText(await applyRendered({ config, http, rendered, confirm, transport, host }));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "updates_fetch",
    {
      title: "Fetch public update metadata",
      description: "Fetch configured Dell and HPE update sources. Checks robots.txt first, rate-limits per host, and records source URL plus retrieval time. Disallowed or failed sources are marked unavailable. Versions are never invented.",
      inputSchema: z.object({ sourceId: z.string().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
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
          results.push({ ...result, records: undefined, recordCount: result.records.length });
        }
        writeCache(config.cachePath, current);
        return asText({ results });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "updates_search",
    {
      title: "Search cached updates",
      description: "Search firmware, BIOS, driver, and package records previously fetched or imported. An empty cache means no versions are known.",
      inputSchema: z.object({ query: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        const current = cache();
        const records = searchUpdates(current, query ?? "");
        return asText({ count: records.length, fetches: current.fetches.map(({ records: _records, ...fetch }) => fetch), records });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "updates_import_local",
    {
      title: "Import a local catalog file",
      description: "Parse a Dell catalog XML or Debian Packages file you obtained yourself, copy it into the local mirror, and cache only versions the parser recognized. Use this when robots.txt disallows the Dell download site.",
      inputSchema: z.object({
        filePath: z.string(),
        vendor: z.string(),
        sourceId: z.string(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
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
    },
  );

  server.registerTool(
    "updates_bundle_export",
    {
      title: "Export an offline bundle",
      description: "Copy specs, update cache, and the firmware mirror layout into a directory with manifest.json and SHA256SUMS. Adds signature.sig when HWOPS_BUNDLE_SIGNING_KEY points at a PEM private key. The private key is not written into the bundle.",
      inputSchema: z.object({ outDir: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ outDir }) => {
      try {
        const current = cache();
        const signingKeyPem = config.signingKeyPath ? readFileSync(config.signingKeyPath, "utf8") : undefined;
        const manifest = exportBundle({
          pluginRoot: config.pluginRoot,
          outDir,
          signingKeyPem,
          unavailableSources: current.fetches
            .filter((fetch) => fetch.status === "unavailable")
            .map((fetch) => ({ id: fetch.sourceId, url: fetch.url, reason: fetch.reason })),
        });
        return asText({
          outDir,
          fileCount: manifest.files.length,
          signature: manifest.signature,
          note: "Carry this directory into the air-gapped site and set HWOPS_OFFLINE=true plus HWOPS_OFFLINE_BUNDLE to the directory. Verify with the out-of-band public key.",
        });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    "updates_bundle_verify",
    {
      title: "Verify an offline bundle",
      description: "Recompute SHA-256 checksums. When signature.sig exists, HWOPS_BUNDLE_PUBLIC_KEY is required and the signature must validate. A public key shipped inside the bundle is not a trust anchor.",
      inputSchema: z.object({ bundleDir: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ bundleDir }) => {
      try {
        const publicKey = config.publicKeyPath ? readFileSync(config.publicKeyPath, "utf8") : undefined;
        const result = verifyBundle(bundleDir, publicKey);
        if (!result.checksumsOk || result.signature === "invalid" || result.signature === "unchecked") {
          return asError(new Error(`${result.message} ${result.mismatches.join("; ")}`.trim()));
        }
        return asText(result);
      } catch (error) {
        return asError(error);
      }
    },
  );

  return server;
}

export function readPluginVersion(root: string): string {
  const manifest = JSON.parse(readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8")) as { version?: string };
  return manifest.version ?? "0.0.0";
}
