import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface HwopsConfig {
  pluginRoot: string;
  offline: boolean;
  tlsVerify: boolean;
  allowWrite: boolean;
  allowUnverifiedApply: boolean;
  writeConfirm: string;
  specDir: string;
  bundleDir: string | null;
  cachePath: string;
  mirrorDir: string;
  fetchMinIntervalMs: number;
  fetchUserAgent: string;
  offlineAllowHosts: string[];
  redfishUser?: string;
  redfishAuth?: string;
  oneviewHost?: string;
  oneviewUser?: string;
  oneviewAuth?: string;
  oneviewApiVersion?: string;
  omeHost?: string;
  omeUser?: string;
  omeAuth?: string;
  snowInstance?: string;
  snowUser?: string;
  snowAuth?: string;
  snowBearer?: string;
  netboxUrl?: string;
  netboxBearer?: string;
  snmpRead?: string;
  switchUser?: string;
  switchAuth?: string;
  switchBearer?: string;
  switchApplyUrl?: string;
  aoscxApiVersion: string;
  bundleSigner?: string;
  bundleVerifier?: string;
}

export class ConfigError extends Error {}

export class WriteDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteDisabledError";
  }
}

export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineError";
  }
}

const unresolvedUserConfig = /^\$\{user_config\.[A-Za-z0-9_]+\}$/;

export function pluginSetting(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || unresolvedUserConfig.test(trimmed)) return undefined;
  return trimmed;
}

function flag(value: string | undefined, fallback: boolean): boolean {
  const resolved = pluginSetting(value);
  if (resolved === undefined) return fallback;
  const v = resolved.toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export function readPluginVersion(root: string): string {
  const manifest = JSON.parse(readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8")) as { version?: string };
  return manifest.version ?? "0.0.0";
}

export function findPluginRoot(start?: string): string {
  const explicit = process.env.HWOPS_PLUGIN_ROOT;
  if (explicit && existsSync(path.join(explicit, ".claude-plugin", "plugin.json"))) {
    return path.resolve(explicit);
  }
  let dir = start ?? path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError("Could not find the plugin root (.claude-plugin/plugin.json). Point HWOPS_PLUGIN_ROOT at the plugin root.");
}

// Account values arrive only as HWOPS_CFG_* entries that .mcp.json fills from
// ${user_config.*}. This module does not open key files and does not build a
// remote URL. Callers send each value only to the management host the operator
// configured (iLO, iDRAC, OneView, OpenManage Enterprise, ServiceNow, NetBox, or a switch).
export function loadConfig(settings: NodeJS.ProcessEnv = process.env): HwopsConfig {
  const pluginRoot = findPluginRoot();
  const bundleDir = settings.HWOPS_OFFLINE_BUNDLE?.trim() ? path.resolve(settings.HWOPS_OFFLINE_BUNDLE) : null;
  const dataRoot = bundleDir ?? pluginRoot;
  const specDir = settings.HWOPS_SPEC_DIR?.trim()
    ? path.resolve(settings.HWOPS_SPEC_DIR)
    : path.join(dataRoot, "data", "specs");
  const mirrorDir = settings.HWOPS_MIRROR_DIR?.trim()
    ? path.resolve(settings.HWOPS_MIRROR_DIR)
    : path.join(dataRoot, "data", "mirror");
  const cachePath = settings.HWOPS_UPDATE_CACHE?.trim()
    ? path.resolve(settings.HWOPS_UPDATE_CACHE)
    : path.join(dataRoot, "data", "updates", "cache.json");
  return {
    pluginRoot,
    offline: flag(settings.HWOPS_OFFLINE, false),
    tlsVerify: flag(settings.HWOPS_TLS_VERIFY, true),
    allowWrite: settings.HWOPS_ALLOW_WRITE === "true",
    allowUnverifiedApply: settings.HWOPS_ALLOW_UNVERIFIED_APPLY === "true",
    writeConfirm: settings.HWOPS_WRITE_CONFIRM?.trim() || "APPLY",
    specDir,
    bundleDir,
    cachePath,
    mirrorDir,
    fetchMinIntervalMs: Number(settings.HWOPS_FETCH_MIN_INTERVAL_MS ?? 1000) || 1000,
    fetchUserAgent: pluginSetting(settings.HWOPS_FETCH_USER_AGENT) || `hw-spec-locator/${readPluginVersion(pluginRoot)}`,
    offlineAllowHosts: (settings.HWOPS_OFFLINE_ALLOW_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    redfishUser: pluginSetting(settings.HWOPS_CFG_REDFISH_USER),
    redfishAuth: pluginSetting(settings.HWOPS_CFG_REDFISH_AUTH),
    oneviewHost: pluginSetting(settings.HWOPS_CFG_ONEVIEW_BASE),
    oneviewUser: pluginSetting(settings.HWOPS_CFG_ONEVIEW_USER),
    oneviewAuth: pluginSetting(settings.HWOPS_CFG_ONEVIEW_AUTH),
    oneviewApiVersion: pluginSetting(settings.HWOPS_CFG_ONEVIEW_API),
    omeHost: pluginSetting(settings.HWOPS_CFG_OME_BASE),
    omeUser: pluginSetting(settings.HWOPS_CFG_OME_USER),
    omeAuth: pluginSetting(settings.HWOPS_CFG_OME_AUTH),
    snowInstance: pluginSetting(settings.HWOPS_CFG_SNOW_BASE),
    snowUser: pluginSetting(settings.HWOPS_CFG_SNOW_USER),
    snowAuth: pluginSetting(settings.HWOPS_CFG_SNOW_AUTH),
    snowBearer: pluginSetting(settings.HWOPS_CFG_SNOW_BEARER),
    netboxUrl: pluginSetting(settings.HWOPS_CFG_NETBOX_BASE),
    netboxBearer: pluginSetting(settings.HWOPS_CFG_NETBOX_BEARER),
    snmpRead: pluginSetting(settings.HWOPS_CFG_SNMP_READ),
    switchUser: pluginSetting(settings.HWOPS_CFG_SWITCH_USER),
    switchAuth: pluginSetting(settings.HWOPS_CFG_SWITCH_AUTH),
    switchBearer: pluginSetting(settings.HWOPS_CFG_SWITCH_BEARER),
    switchApplyUrl: pluginSetting(settings.HWOPS_CFG_SWITCH_TARGET),
    aoscxApiVersion: pluginSetting(settings.HWOPS_AOSCX_API_VERSION) || "v10.13",
    bundleSigner: pluginSetting(settings.HWOPS_CFG_BUNDLE_SIGNER),
    bundleVerifier: pluginSetting(settings.HWOPS_CFG_BUNDLE_VERIFIER),
  };
}

export function assertWriteAllowed(config: HwopsConfig, confirm: string | undefined, action: string): void {
  if (!config.allowWrite) {
    throw new WriteDisabledError(
      `Refusing ${action}. The server is read-only until HWOPS_ALLOW_WRITE=true. Preview, CSV output, generate, and validate tools stay available.`,
    );
  }
  if (confirm !== config.writeConfirm) {
    throw new WriteDisabledError(
      `Refusing ${action}. Pass confirm equal to the HWOPS_WRITE_CONFIRM value (the default is APPLY).`,
    );
  }
}

export function assertOnline(config: HwopsConfig, url: string): void {
  if (!config.offline) return;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new OfflineError(`Refusing network call while HWOPS_OFFLINE=true (${url}).`);
  }
  if (!config.offlineAllowHosts.includes(host)) {
    throw new OfflineError(
      `Air-gapped mode is on. Refusing ${url}. Use the offline bundle, or list this host in HWOPS_OFFLINE_ALLOW_HOSTS for a management network you intend to reach.`,
    );
  }
}
