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
  throw new ConfigError("Could not find the plugin root (.claude-plugin/plugin.json). Point HWOPS_PLUGIN_ROOT at the plugin root.");
}
function loadConfig(settings = process.env) {
  const pluginRoot = findPluginRoot();
  const bundleDir = settings.HWOPS_OFFLINE_BUNDLE?.trim() ? path.resolve(settings.HWOPS_OFFLINE_BUNDLE) : null;
  const dataRoot = bundleDir ?? pluginRoot;
  const specDir = settings.HWOPS_SPEC_DIR?.trim() ? path.resolve(settings.HWOPS_SPEC_DIR) : path.join(dataRoot, "data", "specs");
  const mirrorDir = settings.HWOPS_MIRROR_DIR?.trim() ? path.resolve(settings.HWOPS_MIRROR_DIR) : path.join(dataRoot, "data", "mirror");
  const cachePath = settings.HWOPS_UPDATE_CACHE?.trim() ? path.resolve(settings.HWOPS_UPDATE_CACHE) : path.join(dataRoot, "data", "updates", "cache.json");
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
    fetchMinIntervalMs: Number(settings.HWOPS_FETCH_MIN_INTERVAL_MS ?? 1e3) || 1e3,
    fetchUserAgent: pluginSetting(settings.HWOPS_FETCH_USER_AGENT) || `hw-spec-locator/${readPluginVersion(pluginRoot)}`,
    offlineAllowHosts: (settings.HWOPS_OFFLINE_ALLOW_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
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
    bundleVerifier: pluginSetting(settings.HWOPS_CFG_BUNDLE_VERIFIER)
  };
}
function assertWriteAllowed(config, confirm, action) {
  if (!config.allowWrite) {
    throw new WriteDisabledError(
      `Refusing ${action}. The server is read-only until HWOPS_ALLOW_WRITE=true. Preview, CSV output, generate, and validate tools stay available.`
    );
  }
  if (confirm !== config.writeConfirm) {
    throw new WriteDisabledError(
      `Refusing ${action}. Pass confirm equal to the HWOPS_WRITE_CONFIRM value (the default is APPLY).`
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
