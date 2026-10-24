# HPE and Dell Hardware Operations

Claude Code plugin for infrastructure engineers working on HPE and Dell hardware. It searches a sourced specification catalog, reads live inventory, normalizes assets for a CMDB, maps PDU power, ingests public firmware metadata, and drafts AI-fabric switch configuration.

Author: **Kaname Kanam**. License: [MIT](LICENSE).

This repository is ready to publish. It contains no credentials, tokens, private keys, or firmware binaries. Publishing to a Git host or to Anthropic's plugin directory is a separate step and is not done here.

## What you can do

- Search and compare servers, storage, and switches, including Dell AI Factory and HPE Private Cloud AI components that were captured from publisher pages.
- Read HPE iLO and Dell iDRAC over DMTF Redfish, plus HPE OneView and Dell OpenManage Enterprise.
- Normalize assets to one schema and export JSON or CSV. Preview or, when the write gate is open, sync to ServiceNow and NetBox.
- Map PSUs to PDU outlets, estimate per-feed and per-phase load, and export NetBox power ports, outlets, and feeds.
- Generate and validate switch drafts for Aruba AOS-CX, Dell OS10, Enterprise SONiC, Cumulus NVUE, and Junos, including rail-optimized GPU cabling.
- Fetch or import firmware, BIOS, and driver metadata with the source URL and retrieval time on every record.
- Export a checksummed offline bundle and run from it on an air-gapped site.

Numbers in the catalog are claims. `verified` cites a publisher source. `unverified` is an extract that was not confirmed on the publisher site. `unavailable` is null on purpose. The plugin does not fill those gaps.

## Requirements

- Node.js 20 or newer, for the bundled MCP server
- Claude Code, to load the plugin

The MCP server entry point is `mcp-server/dist/index.js`. It is built and committed, so installing the plugin does not require `npm install`.

## Install

From a local checkout:

```bash
claude plugin marketplace add ./
claude plugin install hpe-dell-hwops@kaname-hwops
```

In a Claude Code session the same actions are `/plugin marketplace add` and `/plugin install`.

After this repository is on GitHub, add that `owner/repo` as the marketplace source and install `hpe-dell-hwops@kaname-hwops`. This README does not name a repository URL because one is not attached yet.

## Commands and skills

Commands are explicit. Skills load when the request matches.

| Command | Purpose |
| --- | --- |
| `/hpe-dell-hwops:hw-spec` | Search or compare specifications |
| `/hpe-dell-hwops:inventory` | Redfish, OneView, or OpenManage Enterprise |
| `/hpe-dell-hwops:cmdb-sync` | Normalize, export, preview, or gated sync |
| `/hpe-dell-hwops:netconfig` | Validate and draft a switch config |
| `/hpe-dell-hwops:pdu-map` | PSU-to-outlet load and redundancy |
| `/hpe-dell-hwops:firmware` | Cached or imported firmware metadata |
| `/hpe-dell-hwops:offline-bundle` | Export or verify an air-gapped bundle |

Skills: `hardware-spec-search`, `live-inventory`, `cmdb-operations`, `network-fabric`, `ai-factory`, `firmware-updates`, `pdu-power`.

The subagent is `hw-ops`.

MCP server name: `hwops` (shown as `plugin:hpe-dell-hwops:hwops`).

## MCP tools

| Tool | Default |
| --- | --- |
| `spec_search`, `spec_get`, `spec_compare`, `spec_baselines`, `spec_coverage` | Read |
| `redfish_inventory`, `oneview_inventory`, `ome_inventory` | Read |
| `cmdb_normalize`, `cmdb_export`, `cmdb_preview` | Read |
| `cmdb_sync` | Write, gated |
| `power_analyze`, `power_pull_pdu` | Read |
| `net_generate`, `net_validate`, `net_diff`, `net_map_cabling` | Read |
| `net_apply` | Write, gated. Pinned commands only |
| `updates_fetch`, `updates_search`, `updates_bundle_verify` | Read |
| `updates_import_local`, `updates_bundle_export` | Writes local files only |

## Configuration

Plugin settings (not secrets):

| Setting | Default | Effect |
| --- | --- | --- |
| `offline_mode` | false | Sets `HWOPS_OFFLINE`. Refuses network calls |
| `tls_verify` | true | Verifies TLS certificates on management APIs |

Secrets and endpoints are environment variables. Do not put them in `plugin.json`, tool arguments, or the chat.

| Variable | Used for |
| --- | --- |
| `HWOPS_REDFISH_USERNAME`, `HWOPS_REDFISH_PASSWORD` | iLO and iDRAC |
| `HWOPS_ONEVIEW_HOST`, `HWOPS_ONEVIEW_USERNAME`, `HWOPS_ONEVIEW_PASSWORD` | OneView |
| `HWOPS_ONEVIEW_API_VERSION` | Optional. Otherwise the server reads `/rest/version` |
| `HWOPS_OME_HOST`, `HWOPS_OME_USERNAME`, `HWOPS_OME_PASSWORD` | OpenManage Enterprise |
| `HWOPS_SNOW_INSTANCE`, `HWOPS_SNOW_USERNAME`, `HWOPS_SNOW_PASSWORD` or `HWOPS_SNOW_TOKEN` | ServiceNow |
| `HWOPS_NETBOX_URL`, `HWOPS_NETBOX_TOKEN` | NetBox |
| `HWOPS_SNMP_COMMUNITY` | SNMPv2c PDU identity. Never a tool argument |
| `HWOPS_SWITCH_USERNAME`, `HWOPS_SWITCH_PASSWORD` or `HWOPS_SWITCH_TOKEN` | Switch apply |
| `HWOPS_SWITCH_APPLY_URL` | `generic-https` apply target |
| `HWOPS_AOSCX_API_VERSION` | AOS-CX REST version. Default `v10.13` |
| `HWOPS_ALLOW_WRITE` | Must be exactly `true` before CMDB sync or switch apply |
| `HWOPS_WRITE_CONFIRM` | Confirm string. Default `APPLY` |
| `HWOPS_ALLOW_UNVERIFIED_APPLY` | Must be exactly `true` before an unverified draft may be considered. Unverified text is still not transmitted |
| `HWOPS_OFFLINE` | `true` blocks public fetches and live APIs |
| `HWOPS_OFFLINE_ALLOW_HOSTS` | Comma-separated hosts still allowed while offline |
| `HWOPS_OFFLINE_BUNDLE` | Directory of a verified offline bundle. Replaces the data root |
| `HWOPS_TLS_VERIFY` | `false` only for a lab processor with a private CA |
| `HWOPS_SPEC_DIR`, `HWOPS_MIRROR_DIR`, `HWOPS_UPDATE_CACHE` | Override data locations |
| `HWOPS_FETCH_MIN_INTERVAL_MS` | Per-host delay. Default `1000` |
| `HWOPS_FETCH_USER_AGENT` | Default `hpe-dell-hwops/1.0.0` |
| `HWOPS_BUNDLE_SIGNING_KEY` | PEM private key used at export. Not copied into the bundle |
| `HWOPS_BUNDLE_PUBLIC_KEY` | PEM public key used at verify. A key inside the bundle is not trusted |
| `HWOPS_PLUGIN_ROOT` | Plugin root, if discovery fails |

## Examples

Specification search:

```text
/hpe-dell-hwops:hw-spec Compare DL380 Gen11 and PowerEdge R760 memory and drive limits
```

The answer should cite verification. Power-supply option watts are not system load. XE9680 8x H100 700 W is accelerator TDP, not a nameplate.

Live inventory:

```text
/hpe-dell-hwops:inventory ilo.example.internal redfish
```

Set `HWOPS_REDFISH_USERNAME` and `HWOPS_REDFISH_PASSWORD` in the environment first.

CMDB preview, then a gated sync:

```text
/hpe-dell-hwops:cmdb-sync preview netbox
```

```bash
export HWOPS_ALLOW_WRITE=true
export HWOPS_NETBOX_URL=https://netbox.example.internal
export HWOPS_NETBOX_TOKEN=...
```

Pass `confirm` as `APPLY` only after you intend the write. ServiceNow matches an existing serial and updates it; otherwise it creates `cmdb_ci_server`, `cmdb_ci_storage_device`, `cmdb_ci_ip_switch`, or `cmdb_ci_pdu`.

AI fabric draft:

```text
/hpe-dell-hwops:netconfig sonic ai-rail
```

Pinned commands are the part that can be applied. PFC, ECN, DCQCN, and EVPN/VXLAN CLI are labeled UNVERIFIED and are not sent by `net_apply`. `net_map_cabling` assigns one rail per leaf from NIC order. That map is a planning heuristic, not a vendor bill of materials.

PDU map:

```text
/hpe-dell-hwops:pdu-map two feeds for a PowerScale F710, phase B rated 800 W
```

`power_analyze` uses operator `loadWatts` when you set it, otherwise catalog `systemPlanningWatts` (887 W for the F710 at 35 C). Normal load is split across feeds and then across phases on that feed. Failover places the full load on each feed, then splits it across that feed's phases. Volts times amps is reported as VA.

## Firmware metadata

Configured sources live in `data/updates/sources.json`.

- Dell Lifecycle Controller catalog: `https://downloads.dell.com/catalog/Catalog.xml.gz`
- Dell Enterprise catalog: `https://downloads.dell.com/catalog/Catalog.gz`
- HPE Software Delivery Repository index: `https://downloads.linux.hpe.com/SDR/index.html`

On 2026-10-24, `https://downloads.dell.com/robots.txt` was:

```text
User-agent: *
Allow: /manuals
Allow: /topicspdf
Disallow: /
```

The fetcher records both Dell catalogs `unavailable` and does not download them. Save a catalog you are entitled to use, then import it:

```bash
node mcp-server/dist/index.js import-local \
  --file /path/to/Catalog.xml.gz \
  --vendor Dell \
  --source-id dell-lc-catalog
```

The file is copied under `data/mirror/dell/catalog/`. Only versions the parser reads are stored. A file with no recognizable version produces zero records.

The HPE SDR `robots.txt` returned HTTP 404 on 2026-10-24, so a later fetch is allowed. The HTML index is not turned into package versions. Point `import-local` at a `Packages` file when you have one (`--source-id hpe-sdr-index`).

`spec_baselines` joins those retrieved records to a product. Newest is not labeled recommended. The starter baselines are `unavailable` with an empty component list.

CLI, from the plugin root:

```bash
node mcp-server/dist/index.js fetch --source hpe-sdr-index
node mcp-server/dist/index.js bundle --out /tmp/hwops-bundle
node mcp-server/dist/index.js verify --bundle /tmp/hwops-bundle
```

`fetch` checks robots.txt, waits at least one second between requests to a host, and writes status, URL, and time into `data/updates/cache.json`. A failed robots fetch fails closed.

## Air-gapped mode

Export on a connected machine:

```bash
export HWOPS_BUNDLE_SIGNING_KEY=/secure/hwops-bundle.key
node mcp-server/dist/index.js bundle --out /media/hwops-bundle
```

Create the key pair outside the repository, for example:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out hwops-bundle.key
openssl pkey -in hwops-bundle.key -pubout -out hwops-bundle.pub
```

Do not commit either file. The bundle gets `manifest.json`, `SHA256SUMS`, and, when a key is set, `signature.sig` over the checksum file. The private key stays where `HWOPS_BUNDLE_SIGNING_KEY` points.

On the air-gapped site:

```bash
export HWOPS_BUNDLE_PUBLIC_KEY=/secure/hwops-bundle.pub
node mcp-server/dist/index.js verify --bundle /media/hwops-bundle
export HWOPS_OFFLINE=true
export HWOPS_OFFLINE_BUNDLE=/media/hwops-bundle
```

Or set the plugin's offline mode. Spec search, config generation, power math, and CMDB export then use the bundle. Live Redfish, CMDB sync, and public fetches stay blocked unless a host is listed in `HWOPS_OFFLINE_ALLOW_HOSTS`.

Checksums detect a changed file that is still listed. A signature binds `SHA256SUMS`, so a coordinated edit of the manifest and the checksum file fails verification when the public key is present. If `signature.sig` exists and the public key is unset, verification fails as unchecked.

Mirror layout inside the bundle:

```text
data/mirror/dell/catalog/
data/mirror/hpe/sdr/
```

The starter tree has no vendor binaries. See `data/mirror/README.md`.

## Catalog coverage

Included, with sources in [data/specs/SOURCES.md](data/specs/SOURCES.md): ProLiant DL380 Gen11, DL380a Gen12, DL384 Gen12, ProLiant Compute XD685 (unverified), PowerEdge R760, XE9680, XE8640, XE9712, PowerScale F710, Alletra Storage MP B10000, Aruba CX 9300-32D, PowerSwitch Z9864F-ON.

Not in the starter set, because no primary page was captured: ProLiant DL360, Synergy, Cray XD, Juniper platforms, PowerEdge R660, PowerStore, and OS10 S-series switches. OS10 and Junos templates still exist. Cray XD is not an alias of XD685.

`data/specs/solutions.json` only points at products above. It is not a Dell AI Factory or HPE Private Cloud AI architecture.

## Develop

```bash
cd mcp-server
npm install
npm test
npm run typecheck
npm run build
```

Tests use mocked Redfish, OneView, OpenManage, ServiceNow, NetBox, SNMP, and HTTP. They do not contact Dell or HPE.

Validate the plugin manifests from the repository root:

```bash
node scripts/validate-plugin.mjs
```

`claude plugin validate . --strict` is the upstream check when the Claude Code CLI is installed.

## Publish later

1. Create the GitHub repository and push this branch.
2. `claude plugin marketplace add <owner>/<repo>`
3. `claude plugin install hpe-dell-hwops@kaname-hwops`
4. Submission to Anthropic's plugin directory, if you want that listing, is a later human step. Nothing in this repo submits it.

Confirm `git status` shows no `.env`, `*.pem`, or `*.key` before the first public push.
