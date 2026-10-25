function oneviewLoginBody(account, auth) {
  return JSON.stringify({ userName: account, password: auth });
}

export { oneviewLoginBody as o };
