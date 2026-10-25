// OneView session body. This module does not build remote URLs.
// The account values come from plugin user_config via .mcp.json and are sent
// only to the OneView host the operator named.

export function oneviewLoginBody(account: string, auth: string): string {
  return JSON.stringify({ userName: account, password: auth });
}
