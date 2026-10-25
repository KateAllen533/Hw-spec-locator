function unifiedDiff(before, after, beforeName = "before", afterName = "after") {
  const a = before.split("\n");
  const b = after.split("\n");
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i2 = a.length - 1; i2 >= 0; i2--) {
    for (let j2 = b.length - 1; j2 >= 0; j2--) {
      dp[i2][j2] = a[i2] === b[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    }
  }
  const lines = [`--- ${beforeName}`, `+++ ${afterName}`];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`-${a[i]}`);
      i++;
    } else {
      lines.push(`+${b[j]}`);
      j++;
    }
  }
  while (i < a.length) lines.push(`-${a[i++]}`);
  while (j < b.length) lines.push(`+${b[j++]}`);
  return lines.join("\n");
}
function structuralDiff(before, after) {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes = [];
  for (const key of keys) {
    if (a[key] === b[key]) continue;
    changes.push({ path: key, before: a[key] ?? null, after: b[key] ?? null });
  }
  return { changed: changes.length, changes };
}
function flatten(value, prefix = "") {
  if (value === null || typeof value !== "object") return { [prefix || "$"]: JSON.stringify(value) };
  const out = {};
  if (Array.isArray(value)) {
    value.forEach((item, index) => Object.assign(out, flatten(item, `${prefix}[${index}]`)));
    if (value.length === 0) out[prefix || "$"] = "[]";
    return out;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) out[prefix || "$"] = "{}";
  for (const [key, child] of entries) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

export { structuralDiff as s, unifiedDiff as u };
