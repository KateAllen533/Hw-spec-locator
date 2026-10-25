// Stand-in for the ajv package. The MCP SDK compiles JSON Schema only when it
// validates an elicitation form, and this plugin does not call that API.

class Ajv {
  constructor() {
    this.schemas = new Map();
  }

  addFormat() {}

  addKeyword() {}

  getSchema(id) {
    return this.schemas.get(id);
  }

  compile(schema) {
    const validate = (data) => {
      validate.errors = null;
      return true;
    };
    if (schema && typeof schema.$id === "string") this.schemas.set(schema.$id, validate);
    return validate;
  }

  errorsText() {
    return "";
  }
}

export { Ajv as A };
