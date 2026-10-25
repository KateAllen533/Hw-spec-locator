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
  redfishUsername?: string;
  redfishPassword?: string;
  oneviewHost?: string;
  oneviewUsername?: string;
  oneviewPassword?: string;
  oneviewApiVersion?: string;
  omeHost?: string;
  omeUsername?: string;
  omePassword?: string;
  snowInstance?: string;
  snowUsername?: string;
  snowPassword?: string;
  snowToken?: string;
  netboxUrl?: string;
  netboxToken?: string;
  snmpCommunity?: string;
  switchUsername?: string;
  switchPassword?: string;
  switchToken?: string;
  switchApplyUrl?: string;
  aoscxApiVersion: string;
  signingKeyPem?: string;
  publicKeyPem?: string;
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
  throw new ConfigError("Could not find the plugin root (.claude-plugin/plugin.json). Set HWOPS_PLUGIN_ROOT.");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HwopsConfig {
  const pluginRoot = findPluginRoot();
  const bundleDir = env.HWOPS_OFFLINE_BUNDLE?.trim() ? path.resolve(env.HWOPS_OFFLINE_BUNDLE) : null;
  const dataRoot = bundleDir ?? pluginRoot;
  const specDir = env.HWOPS_SPEC_DIR?.trim()
    ? path.resolve(env.HWOPS_SPEC_DIR)
    : path.join(dataRoot, "data", "specs");
  const mirrorDir = env.HWOPS_MIRROR_DIR?.trim()
    ? path.resolve(env.HWOPS_MIRROR_DIR)
    : path.join(dataRoot, "data", "mirror");
  const cachePath = env.HWOPS_UPDATE_CACHE?.trim()
    ? path.resolve(env.HWOPS_UPDATE_CACHE)
    : path.join(dataRoot, "data", "updates", "cache.json");
  return {
    pluginRoot,
    offline: flag(env.HWOPS_OFFLINE, false),
    tlsVerify: flag(env.HWOPS_TLS_VERIFY, true),
    allowWrite: env.HWOPS_ALLOW_WRITE === "true",
    allowUnverifiedApply: env.HWOPS_ALLOW_UNVERIFIED_APPLY === "true",
    writeConfirm: env.HWOPS_WRITE_CONFIRM?.trim() || "APPLY",
    specDir,
    bundleDir,
    cachePath,
    mirrorDir,
    fetchMinIntervalMs: Number(env.HWOPS_FETCH_MIN_INTERVAL_MS ?? 1000) || 1000,
    fetchUserAgent: pluginSetting(env.HWOPS_FETCH_USER_AGENT) || `hw-spec-locator/${readPluginVersion(pluginRoot)}`,
    offlineAllowHosts: (env.HWOPS_OFFLINE_ALLOW_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    redfishUsername: pluginSetting(env.HWOPS_REDFISH_USERNAME),
    redfishPassword: pluginSetting(env.HWOPS_REDFISH_PASSWORD),
    oneviewHost: pluginSetting(env.HWOPS_ONEVIEW_HOST),
    oneviewUsername: pluginSetting(env.HWOPS_ONEVIEW_USERNAME),
    oneviewPassword: pluginSetting(env.HWOPS_ONEVIEW_PASSWORD),
    oneviewApiVersion: pluginSetting(env.HWOPS_ONEVIEW_API_VERSION),
    omeHost: pluginSetting(env.HWOPS_OME_HOST),
    omeUsername: pluginSetting(env.HWOPS_OME_USERNAME),
    omePassword: pluginSetting(env.HWOPS_OME_PASSWORD),
    snowInstance: pluginSetting(env.HWOPS_SNOW_INSTANCE),
    snowUsername: pluginSetting(env.HWOPS_SNOW_USERNAME),
    snowPassword: pluginSetting(env.HWOPS_SNOW_PASSWORD),
    snowToken: pluginSetting(env.HWOPS_SNOW_TOKEN),
    netboxUrl: pluginSetting(env.HWOPS_NETBOX_URL),
    netboxToken: pluginSetting(env.HWOPS_NETBOX_TOKEN),
    snmpCommunity: pluginSetting(env.HWOPS_SNMP_COMMUNITY),
    switchUsername: pluginSetting(env.HWOPS_SWITCH_USERNAME),
    switchPassword: pluginSetting(env.HWOPS_SWITCH_PASSWORD),
    switchToken: pluginSetting(env.HWOPS_SWITCH_TOKEN),
    switchApplyUrl: pluginSetting(env.HWOPS_SWITCH_APPLY_URL),
    aoscxApiVersion: pluginSetting(env.HWOPS_AOSCX_API_VERSION) || "v10.13",
    signingKeyPem: pluginSetting(env.HWOPS_BUNDLE_SIGNING_KEY),
    publicKeyPem: pluginSetting(env.HWOPS_BUNDLE_PUBLIC_KEY),
  };
}

export function assertWriteAllowed(config: HwopsConfig, confirm: string | undefined, action: string): void {
  if (!config.allowWrite) {
    throw new WriteDisabledError(
      `Refusing ${action}. The server is read-only until HWOPS_ALLOW_WRITE=true. Preview, export, generate, and validate tools stay available.`,
    );
  }
  if (confirm !== config.writeConfirm) {
    throw new WriteDisabledError(
      `Refusing ${action}. Pass confirm set to the HWOPS_WRITE_CONFIRM value (the default is APPLY).`,
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
