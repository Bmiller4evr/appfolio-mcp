// ABOUTME: Extracts AppFolio's embedded OpenAPI spec from its Redocly HTML doc export.
// ABOUTME: Pure functions, tested against a small fixture; the real export is 3.9MB and lives outside the repo.
export interface RawOperation {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  tag: string;
}

const MARKER = "const __redoc_state = ";
const METHODS = ["get", "post", "patch", "put", "delete"];

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

export function extractOperations(state: any): RawOperation[] {
  const paths = state.spec.data.paths as Record<string, Record<string, any>>;
  const ops: RawOperation[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of METHODS) {
      const op = methods[method];
      if (!op) continue;
      ops.push({
        method: method.toUpperCase(),
        path,
        operationId: op.operationId ?? "",
        summary: op.summary ?? op.description ?? "",
        tag: (op.tags && op.tags[0]) ?? "Untagged",
      });
    }
  }
  return ops;
}
