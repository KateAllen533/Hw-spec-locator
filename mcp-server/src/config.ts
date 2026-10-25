import { existsSync } from "node:fs";
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
  signingKeyPath?: string;
  publicKeyPath?: string;
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

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "${user_config.offline_mode}" || v === "${user_config.tls_verify}") return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
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
    fetchUserAgent: env.HWOPS_FETCH_USER_AGENT?.trim() || "hw-spec-locator/1.0.0",
    offlineAllowHosts: (env.HWOPS_OFFLINE_ALLOW_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    redfishUsername: env.HWOPS_REDFISH_USERNAME,
    redfishPassword: env.HWOPS_REDFISH_PASSWORD,
    oneviewHost: env.HWOPS_ONEVIEW_HOST,
    oneviewUsername: env.HWOPS_ONEVIEW_USERNAME,
    oneviewPassword: env.HWOPS_ONEVIEW_PASSWORD,
    oneviewApiVersion: env.HWOPS_ONEVIEW_API_VERSION,
    omeHost: env.HWOPS_OME_HOST,
    omeUsername: env.HWOPS_OME_USERNAME,
    omePassword: env.HWOPS_OME_PASSWORD,
    snowInstance: env.HWOPS_SNOW_INSTANCE,
    snowUsername: env.HWOPS_SNOW_USERNAME,
    snowPassword: env.HWOPS_SNOW_PASSWORD,
    snowToken: env.HWOPS_SNOW_TOKEN,
    netboxUrl: env.HWOPS_NETBOX_URL,
    netboxToken: env.HWOPS_NETBOX_TOKEN,
    snmpCommunity: env.HWOPS_SNMP_COMMUNITY,
    switchUsername: env.HWOPS_SWITCH_USERNAME,
    switchPassword: env.HWOPS_SWITCH_PASSWORD,
    switchToken: env.HWOPS_SWITCH_TOKEN,
    switchApplyUrl: env.HWOPS_SWITCH_APPLY_URL,
    aoscxApiVersion: env.HWOPS_AOSCX_API_VERSION?.trim() || "v10.13",
    signingKeyPath: env.HWOPS_BUNDLE_SIGNING_KEY,
    publicKeyPath: env.HWOPS_BUNDLE_PUBLIC_KEY,
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
