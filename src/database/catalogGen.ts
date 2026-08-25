// ABOUTME: Extracts AppFolio's embedded OpenAPI spec from its Redocly HTML doc export, including
// ABOUTME: the path/query/body detail a caller needs to build a valid request for each operation.
export interface PathParam {
  name: string;
  required: boolean;
  description: string;
}

// `name` is the literal query string key, not the OpenAPI parameter name: AppFolio sends its
// filter and pagination parameters in deepObject style, so what a caller actually writes is
// "filters[LastUpdatedAtFrom]", and the bare "filters" is never a usable key on its own.
export interface QueryParam {
  name: string;
  in: "query";
  required: boolean;
  type: string;
  format?: string;
  enum?: string[];
  description: string;
}

export interface BodyProperty {
  name: string;
  type: string;
  required: boolean;
  description: string;
  properties?: BodyProperty[];
}

export interface RequestBodySpec {
  contentType: string;
  required: boolean;
  properties: BodyProperty[];
}

export interface RawOperation {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  pathParams: PathParam[];
  queryParams: QueryParam[];
  requestBody?: RequestBodySpec;
}

const MARKER = "const __redoc_state = ";
const METHODS = ["get", "post", "patch", "put", "delete"];
const REF_PREFIX = "#/components/schemas/";

// Nested body properties are expanded one level: AppFolio's arrays of line items (bill line
// items, work order billable items) carry their attributes there, and nothing in the spec nests
// deeper than that in a way a caller needs spelled out.
const BODY_NESTING_DEPTH = 1;

export function extractReDocState(html: string): any {
  const startMarkerIdx = html.indexOf(MARKER);
  if (startMarkerIdx === -1) throw new Error("__redoc_state marker not found in HTML");
  const jsonStart = startMarkerIdx + MARKER.length;

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Could not find balanced end of __redoc_state JSON object");

  return JSON.parse(html.slice(jsonStart, end));
}

interface ResolvedSchema {
  type?: string;
  format?: string;
  enum?: string[];
  description?: string;
  items?: any;
  properties: Record<string, any>;
  required: string[];
}

// AppFolio composes its schemas out of $ref, allOf, and oneOf, so a schema has to be flattened
// before its properties can be read. oneOf branches are alternatives ("supply exactly one of
// these"), so their properties are merged in but never marked required: a flat property list
// cannot carry that choice, and marking every branch required would be a lie.
function resolveSchema(schema: any, spec: any, seen: Set<string> = new Set()): ResolvedSchema {
  if (!schema || typeof schema !== "object") return { properties: {}, required: [] };

  if (typeof schema.$ref === "string") {
    if (!schema.$ref.startsWith(REF_PREFIX)) return { properties: {}, required: [] };
    const name = schema.$ref.slice(REF_PREFIX.length);
    if (seen.has(name)) return { properties: {}, required: [] };
    return resolveSchema(spec?.components?.schemas?.[name], spec, new Set(seen).add(name));
  }

  const resolved: ResolvedSchema = {
    type: schema.type,
    format: schema.format,
    enum: schema.enum,
    description: schema.description,
    items: schema.items,
    properties: { ...(schema.properties ?? {}) },
    required: [...(schema.required ?? [])],
  };

  const mergeBranch = (branch: any, inheritRequired: boolean) => {
    const other = resolveSchema(branch, spec, seen);
    resolved.type ??= other.type;
    resolved.format ??= other.format;
    resolved.enum ??= other.enum;
    resolved.description ??= other.description;
    resolved.items ??= other.items;
    for (const [name, propSchema] of Object.entries(other.properties)) {
      if (!(name in resolved.properties)) resolved.properties[name] = propSchema;
    }
    if (!inheritRequired) return;
    for (const name of other.required) if (!resolved.required.includes(name)) resolved.required.push(name);
  };

  for (const branch of schema.allOf ?? []) mergeBranch(branch, true);
  for (const branch of schema.oneOf ?? []) mergeBranch(branch, false);

  return resolved;
}

function schemaType(resolved: ResolvedSchema): string {
  if (resolved.type) return resolved.type;
  return Object.keys(resolved.properties).length > 0 ? "object" : "string";
}

function toQueryParam(name: string, resolved: ResolvedSchema, required: boolean): QueryParam {
  const param: QueryParam = {
    name,
    in: "query",
    required,
    type: schemaType(resolved),
    description: resolved.description ?? "",
  };
  if (resolved.format) param.format = resolved.format;
  if (resolved.enum) param.enum = resolved.enum;
  return param;
}

function extractQueryParams(op: any, spec: any): QueryParam[] {
  const params: QueryParam[] = [];
  for (const param of op.parameters ?? []) {
    if (param.in !== "query") continue;
    const resolved = resolveSchema(param.schema, spec);
    const nested = Object.entries(resolved.properties);
    if (param.style === "deepObject" && nested.length > 0) {
      for (const [name, propSchema] of nested) {
        params.push(
          toQueryParam(`${param.name}[${name}]`, resolveSchema(propSchema, spec), resolved.required.includes(name))
        );
      }
      continue;
    }
    params.push(toQueryParam(param.name, { ...resolved, description: param.description ?? resolved.description }, param.required === true));
  }
  return params;
}

function extractPathParams(path: string, op: any): PathParam[] {
  const declared = new Map<string, any>();
  for (const param of op.parameters ?? []) {
    if (param.in === "path") declared.set(param.name, param);
  }
  return [...path.matchAll(/\{(\w+)\}/g)].map((match) => {
    const name = match[1];
    const param = declared.get(name);
    return { name, required: param?.required !== false, description: param?.description ?? "" };
  });
}

function toBodyProperty(name: string, schema: any, required: boolean, spec: any, depth: number): BodyProperty {
  const resolved = resolveSchema(schema, spec);
  const property: BodyProperty = {
    name,
    type: schemaType(resolved),
    required,
    description: resolved.description ?? "",
  };
  if (depth <= 0) return property;

  const nested = property.type === "array" ? resolveSchema(resolved.items, spec) : resolved;
  const nestedProps = Object.entries(nested.properties);
  if (nestedProps.length > 0) {
    property.properties = nestedProps.map(([nestedName, nestedSchema]) =>
      toBodyProperty(nestedName, nestedSchema, nested.required.includes(nestedName), spec, depth - 1)
    );
  }
  return property;
}

function extractRequestBody(op: any, spec: any): RequestBodySpec | undefined {
  const content = op.requestBody?.content;
  if (!content) return undefined;
  const contentType = "application/json" in content ? "application/json" : Object.keys(content)[0];
  if (!contentType) return undefined;

  const resolved = resolveSchema(content[contentType]?.schema, spec);
  return {
    contentType,
    required: op.requestBody.required === true,
    properties: Object.entries(resolved.properties).map(([name, schema]) =>
      toBodyProperty(name, schema, resolved.required.includes(name), spec, BODY_NESTING_DEPTH)
    ),
  };
}

export function extractOperations(state: any): RawOperation[] {
  const spec = state.spec.data;
  const paths = spec.paths as Record<string, Record<string, any>>;
  const ops: RawOperation[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of METHODS) {
      const op = methods[method];
      if (!op) continue;
      const requestBody = extractRequestBody(op, spec);
      ops.push({
        method: method.toUpperCase(),
        path,
        operationId: op.operationId ?? "",
        summary: op.summary ?? op.description ?? "",
        tag: (op.tags && op.tags[0]) ?? "Untagged",
        pathParams: extractPathParams(path, op),
        queryParams: extractQueryParams(op, spec),
        ...(requestBody ? { requestBody } : {}),
      });
    }
  }
  return ops;
}
