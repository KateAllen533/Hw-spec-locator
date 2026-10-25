function asText(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}
function asError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "Error";
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: name, message }, null, 2) }]
  };
}

export { asText as a, asError as b };
