// Turns an operator-supplied management host into a Redfish URL.
// This module does not read account material. Callers send account material
// only to the iLO or iDRAC host named by the operator.

import { managementBase } from "../remote/base-url.js";

export function redfishBase(host: string): string {
  return managementBase(host);
}

export function redfishUrl(base: string, resource: string): string {
  if (resource.startsWith("http://") || resource.startsWith("https://")) return resource;
  const root = base.endsWith("/") ? base : `${base}/`;
  return new URL(resource, root).toString();
}
