export function asText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function asError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "Error";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ error: name, message }, null, 2) }],
  };
}
