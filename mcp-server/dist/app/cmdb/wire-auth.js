function serviceNowAuthorization(bearer, account, auth) {
  if (bearer) return `Bearer ${bearer}`;
  return `Basic ${Buffer.from(`${account}:${auth}`).toString("base64")}`;
}
function netboxAuthorization(bearer) {
  return `Token ${bearer}`;
}

export { netboxAuthorization as n, serviceNowAuthorization as s };
