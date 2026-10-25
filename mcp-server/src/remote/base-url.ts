// Turns an operator-supplied management host into an absolute URL.
// This module does not read account material. Callers send account material
// only to the host the operator named.

export function managementBase(host: string): string {
  const trimmed = host.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}
