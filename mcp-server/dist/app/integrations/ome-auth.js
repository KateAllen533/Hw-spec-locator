const OME_SESSION_HEADER = "x-auth-token";
function omeLoginBody(account, auth) {
  return JSON.stringify({ UserName: account, Password: auth, SessionType: "API" });
}

export { OME_SESSION_HEADER as O, omeLoginBody as o };
