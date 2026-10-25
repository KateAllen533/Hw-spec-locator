const SESSION_HEADER = "x-auth-token";
function basicAuthorization(account, auth) {
  return `Basic ${Buffer.from(`${account}:${auth}`).toString("base64")}`;
}
function redfishLoginBody(account, auth) {
  return JSON.stringify({ UserName: account, Password: auth });
}
function readSessionId(headers) {
  const value = headers[SESSION_HEADER];
  return value ? value : void 0;
}
function applySession(headers, account, auth, sessionId) {
  if (sessionId) headers[SESSION_HEADER] = sessionId;
  else headers.authorization = basicAuthorization(account, auth);
}

export { applySession as a, readSessionId as b, redfishLoginBody as r };
