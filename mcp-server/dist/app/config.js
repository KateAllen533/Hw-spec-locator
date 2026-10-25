import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class ConfigError extends Error {
}
class WriteDisabledError extends Error {
  constructor(message) {
    super(message);
    this.name = "WriteDisabledError";
  }
}
class OfflineError extends Error {
  constructor(message) {
    super(message);
    this.name = "OfflineError";
  }
}
const unresolvedUserConfig = /^\$\{user_config\.[A-Za-z0-9_]+\}$/;
function pluginSetting(value) {
  if (value === void 0) return void 0;
  const trimmed = value.trim();
  if (!trimmed || unresolvedUserConfig.test(trimmed)) return void 0;
  return trimmed;
}
function flag(value, fallback) {
  const resolved = pluginSetting(value);
  if (resolved === void 0) return fallback;
  const v = resolved.toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}
function readPluginVersion(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8"));
  return manifest.version ?? "0.0.0";
}
function findPluginRoot(start) {
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
function loadConfig(env = process.env) {
  const pluginRoot = findPluginRoot();
  const bundleDir = env.HWOPS_OFFLINE_BUNDLE?.trim() ? path.resolve(env.HWOPS_OFFLINE_BUNDLE) : null;
  const dataRoot = bundleDir ?? pluginRoot;
  const specDir = env.HWOPS_SPEC_DIR?.trim() ? path.resolve(env.HWOPS_SPEC_DIR) : path.join(dataRoot, "data", "specs");
  const mirrorDir = env.HWOPS_MIRROR_DIR?.trim() ? path.resolve(env.HWOPS_MIRROR_DIR) : path.join(dataRoot, "data", "mirror");
  const cachePath = env.HWOPS_UPDATE_CACHE?.trim() ? path.resolve(env.HWOPS_UPDATE_CACHE) : path.join(dataRoot, "data", "updates", "cache.json");
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
    fetchMinIntervalMs: Number(env.HWOPS_FETCH_MIN_INTERVAL_MS ?? 1e3) || 1e3,
    fetchUserAgent: pluginSetting(env.HWOPS_FETCH_USER_AGENT) || `hw-spec-locator/${readPluginVersion(pluginRoot)}`,
    offlineAllowHosts: (env.HWOPS_OFFLINE_ALLOW_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
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
    publicKeyPem: pluginSetting(env.HWOPS_BUNDLE_PUBLIC_KEY)
  };
}
function assertWriteAllowed(config, confirm, action) {
  if (!config.allowWrite) {
    throw new WriteDisabledError(
      `Refusing ${action}. The server is read-only until HWOPS_ALLOW_WRITE=true. Preview, export, generate, and validate tools stay available.`
    );
  }
  if (confirm !== config.writeConfirm) {
    throw new WriteDisabledError(
      `Refusing ${action}. Pass confirm set to the HWOPS_WRITE_CONFIRM value (the default is APPLY).`
    );
  }
}
function assertOnline(config, url) {
  if (!config.offline) return;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new OfflineError(`Refusing network call while HWOPS_OFFLINE=true (${url}).`);
  }
  if (!config.offlineAllowHosts.includes(host)) {
    throw new OfflineError(
      `Air-gapped mode is on. Refusing ${url}. Use the offline bundle, or list this host in HWOPS_OFFLINE_ALLOW_HOSTS for a management network you intend to reach.`
    );
  }
}

export { OfflineError as O, assertOnline as a, assertWriteAllowed as b, findPluginRoot as f, loadConfig as l, readPluginVersion as r };
