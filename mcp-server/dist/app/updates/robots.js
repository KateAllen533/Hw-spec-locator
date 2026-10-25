function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}
function robotsDecision(text, status, userAgent, targetPath) {
  if (status === 404 || text === null) {
    return { allowed: true, reason: `robots.txt returned HTTP ${status}. Treated as no crawl restriction.` };
  }
  if (status >= 400) {
    return { allowed: false, reason: `robots.txt returned HTTP ${status}. Refusing to fetch until robots.txt can be read.` };
  }
  const groups = parseRobots(text);
  const agent = userAgent.toLowerCase();
  const specific = groups.filter((group2) => group2.agents.some((name) => name !== "*" && agent.includes(name)));
  const fallback = groups.filter((group2) => group2.agents.includes("*"));
  const group = specific[0] ?? fallback[0];
  if (!group) return { allowed: true, reason: "robots.txt has no matching user-agent group." };
  let winner = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    if (pathMatches(targetPath, rule.path) && (!winner || rule.path.length > winner.path.length)) winner = rule;
  }
  if (!winner) return { allowed: true, reason: "No robots.txt rule matched the path." };
  if (winner.type === "allow") return { allowed: true, reason: `Matched Allow: ${winner.path}` };
  return { allowed: false, reason: `Matched Disallow: ${winner.path}` };
}
function pathMatches(target, rule) {
  if (rule === "/") return true;
  const path = target.startsWith("/") ? target : `/${target}`;
  return path.startsWith(rule);
}
class RateLimiter {
  constructor(minIntervalMs, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleep = sleep;
  }
  nextAt = /* @__PURE__ */ new Map();
  async wait(host) {
    const ready = this.nextAt.get(host) ?? 0;
    const current = this.now();
    const delay = Math.max(0, ready - current);
    this.nextAt.set(host, Math.max(current, ready) + this.minIntervalMs);
    if (delay > 0) await this.sleep(delay);
  }
}

export { RateLimiter as R, robotsDecision as r };
