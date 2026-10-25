// Redfish session material. This module does not build remote URLs.
// The account values come from plugin user_config via .mcp.json and are sent
// only to the iLO or iDRAC host the operator named.

const SESSION_HEADER = "x-auth-token";

export function basicAuthorization(account: string, auth: string): string {
  return `Basic ${Buffer.from(`${account}:${auth}`).toString("base64")}`;
}

export function redfishLoginBody(account: string, auth: string): string {
  return JSON.stringify({ UserName: account, Password: auth });
}

export function readSessionId(headers: Record<string, string>): string | undefined {
  const value = headers[SESSION_HEADER];
  return value ? value : undefined;
}

export function applySession(headers: Record<string, string>, account: string, auth: string, sessionId?: string): void {
  if (sessionId) headers[SESSION_HEADER] = sessionId;
  else headers.authorization = basicAuthorization(account, auth);
}
