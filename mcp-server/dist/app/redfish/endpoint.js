import { m as managementBase } from '../remote/base-url.js';

function redfishBase(host) {
  return managementBase(host);
}
function redfishUrl(base, resource) {
  if (resource.startsWith("http://") || resource.startsWith("https://")) return resource;
  const root = base.endsWith("/") ? base : `${base}/`;
  return new URL(resource, root).toString();
}

export { redfishUrl as a, redfishBase as r };
