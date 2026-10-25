// CMDB request authorization. This module does not build remote URLs.
// The account values come from plugin user_config via .mcp.json and are sent
// only to the ServiceNow instance or NetBox URL the operator configured.

export function serviceNowAuthorization(bearer: string | undefined, account: string | undefined, auth: string | undefined): string {
  if (bearer) return `Bearer ${bearer}`;
  return `Basic ${Buffer.from(`${account}:${auth}`).toString("base64")}`;
}

export function netboxAuthorization(bearer: string): string {
  return `Token ${bearer}`;
}
