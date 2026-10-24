export function unifiedDiff(before: string, after: string, beforeName = "before", afterName = "after"): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
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

export function structuralDiff(before: unknown, after: unknown) {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes = [];
  for (const key of keys) {
    if (a[key] === b[key]) continue;
    changes.push({ path: key, before: a[key] ?? null, after: b[key] ?? null });
  }
  return { changed: changes.length, changes };
}

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (value === null || typeof value !== "object") return { [prefix || "$"]: JSON.stringify(value) };
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    value.forEach((item, index) => Object.assign(out, flatten(item, `${prefix}[${index}]`)));
    if (value.length === 0) out[prefix || "$"] = "[]";
    return out;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) out[prefix || "$"] = "{}";
  for (const [key, child] of entries) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}
