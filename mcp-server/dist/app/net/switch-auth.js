const SESSION_COOKIE = "set-cookie";
function switchLoginBody(account, auth) {
  return JSON.stringify({ username: account, password: auth });
}
function bearerAuthorization(auth) {
  return `Bearer ${auth}`;
}

export { SESSION_COOKIE as S, bearerAuthorization as b, switchLoginBody as s };
