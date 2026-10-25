// Switch session material. This module does not build remote URLs.
// The account values come from plugin user_config via .mcp.json and are sent
// only to the switch host or apply target the operator named.

export const SESSION_COOKIE = "set-cookie";

export function switchLoginBody(account: string, auth: string): string {
  return JSON.stringify({ username: account, password: auth });
}

export function bearerAuthorization(auth: string): string {
  return `Bearer ${auth}`;
}
