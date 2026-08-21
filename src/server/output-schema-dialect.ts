/**
 * Make the declared output schemas acceptable to strict clients.
 *
 * The SDK converts a Zod `outputSchema` with zod-to-json-schema, which stamps
 * every result with `"$schema": "http://json-schema.org/draft-07/schema#"`.
 * It exposes no way to ask for a different dialect: on Zod 3 the target is
 * hard-coded, and the Zod 4 branch defaults to draft-7 as well.
 *
 * Clients that validate the declared dialect reject that outright. Claude Code
 * does, with:
 *
 *   Tool 'comfyui_list_models' has an invalid outputSchema: JSON Schema
 *   declares an unsupported dialect ("$schema": ".../draft-07/schema#").
 *   The default validator supports JSON Schema 2020-12 only
 *
 * and the tool then cannot be called at all - which is worse than never having
 * declared a schema. The schemas this server emits are plain object schemas
 * (type/properties/required/additionalProperties) that are valid under either
 * dialect, so the fix is to stop asserting one and let the client apply its
 * own default. `$schema` is optional in JSON Schema; dropping it narrows
 * nothing.
 *
 * Only `outputSchema` is touched. `inputSchema` carries the same label and is
 * accepted, so there is no reason to change what already works.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** The listing shape this reaches into, kept local and deliberately loose. */
interface ToolListing {
  tools?: Array<{ outputSchema?: { $schema?: string } }>;
}

type RequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;

/** Remove the dialect declaration from one listing. Returns how many it hit. */
export function stripDialect(result: unknown): number {
  const listing = result as ToolListing | null;
  if (!listing?.tools) return 0;

  let stripped = 0;
  for (const tool of listing.tools) {
    if (tool.outputSchema && "$schema" in tool.outputSchema) {
      delete tool.outputSchema.$schema;
      stripped++;
    }
  }
  return stripped;
}

/**
 * Wrap the SDK's `tools/list` handler so declared output schemas carry no
 * dialect.
 *
 * This reaches past the public API - there is no supported hook between the
 * SDK building the listing and it going out on the wire. It is written to fail
 * soft: if the internals move, the wrap is skipped and the server still
 * serves, just with the schemas the SDK produced. Call after every tool is
 * registered; the return value says whether it took, so main() can log it.
 */
export function relaxOutputSchemaDialect(server: McpServer): boolean {
  const lowLevel = server.server as unknown as {
    _requestHandlers?: Map<string, RequestHandler>;
  };

  const handlers = lowLevel._requestHandlers;
  const original = handlers?.get("tools/list");
  if (!handlers || typeof original !== "function") return false;

  handlers.set("tools/list", async (request, extra) => {
    const result = await original(request, extra);
    stripDialect(result);
    return result;
  });

  return true;
}
