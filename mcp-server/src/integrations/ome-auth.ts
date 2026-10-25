// OpenManage Enterprise session material. This module does not build remote URLs.
// The account values come from plugin user_config via .mcp.json and are sent
// only to the OpenManage host the operator named.

export const OME_SESSION_HEADER = "x-auth-token";

export function omeLoginBody(account: string, auth: string): string {
  return JSON.stringify({ UserName: account, Password: auth, SessionType: "API" });
}
