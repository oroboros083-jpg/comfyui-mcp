# CLAUDE.md - ComfyUI MCP Server

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server that enables AI assistants to interact with ComfyUI for generating images, audio, and video. The server is designed to be self-configuring, automatically discovering ComfyUI instances and their capabilities.

## Architecture

```
src/
├── index.ts                 # Entry point: wiring and main() only
├── config.ts                # Configuration management
├── constants.ts             # Shared limits (CHARACTER_LIMIT, page sizes)
├── context.ts               # Server context (shared state)
├── server/
│   ├── connection.ts       # Discovery, health cache, restart watches
│   ├── register.ts         # defineTool: prefix, annotations, conn gate
│   └── tools/              # Tool registration, one file per domain
│       ├── setup.ts        # status, reconnect, start, restart, guides
│       ├── discovery.ts    # capabilities, models, nodes, validation
│       ├── generation.ts   # run workflows, images, workflow files
│       ├── tasks.ts        # queue and task tracking
│       ├── library.ts      # examples, templates, prompting guides
│       └── workspace.ts    # notes, preferences, svg, fonts
├── client/
│   ├── comfyui.ts          # REST API client for ComfyUI
│   └── websocket.ts        # WebSocket client for progress tracking
├── discovery/
│   └── index.ts            # Auto-discovery of ComfyUI instances
├── capabilities/
│   └── index.ts            # Capability detection from object_info
├── workflows/
│   └── builder.ts          # Dynamic workflow generation
├── tools/
│   ├── generate.ts         # Workflow/image schemas, get_image
│   ├── generate-async.ts   # Submit a workflow and track it to completion
│   ├── outputs.ts          # Collect a finished prompt's images
│   ├── models.ts           # Model/node listing and building
│   ├── queue.ts            # Queue management tools
│   ├── install.ts          # Installation assistance
│   ├── launch.ts           # Launcher detection and detached process start
│   ├── validation.ts       # Workflow validation
│   ├── svg.ts              # SVG rendering to PNG
│   ├── fonts.ts            # Font download and management
│   └── examples/           # Example workflows and templates
│       ├── index.ts        # Main exports
│       ├── data.ts         # Aggregated example data
│       ├── types.ts        # Type definitions
│       ├── list-examples.ts # list_examples tool
│       ├── templates.ts    # Template system (search/get/save)
│       ├── recommend.ts    # Workflow recommendations
│       ├── downloads.ts    # Model download URLs
│       ├── basics.ts       # Basic workflow examples
│       ├── flux.ts         # Flux model examples
│       ├── sdxl.ts         # SDXL examples
│       ├── sd3.ts          # SD3 examples
│       ├── controlnet.ts   # ControlNet examples
│       ├── video.ts        # Video generation examples
│       ├── audio.ts        # Audio generation examples
│       ├── hunyuan.ts      # Hunyuan examples
│       ├── next-gen.ts     # Next-gen model examples
│       └── 3d.ts           # 3D generation examples
├── jobs/
│   ├── manager.ts          # Async job tracking
│   └── notifications.ts    # MCP notification handling
├── db/
│   └── index.ts            # SQLite database for notes/templates
├── handlers/
│   ├── resources.ts        # MCP resource handlers
│   └── prompts.ts          # MCP prompt handlers
├── resources/
│   └── prompting-guide.ts  # Model-specific prompting guides
├── analysis/
│   ├── outputs.ts          # User output history analysis
│   └── hash.ts             # Workflow hashing
├── architectures/
│   └── registry.ts         # ARCHITECTURES: detection, shape, guide, advice
└── utils/
    ├── image.ts            # Image processing utilities
    ├── errors.ts           # ToolError: failures that carry their remedy
    ├── response.ts         # Pagination, compact JSON, truncation, formats
    ├── render.ts           # Shared markdown rendering for listings
    └── logging.ts          # MCP logging utilities

evals/                       # Q/A suites for whether a model can use the tools
├── README.md
└── library.xml              # Stable; needs no running ComfyUI
```

## Key Concepts

### MCP Server Pattern
The server uses `@modelcontextprotocol/sdk` with stdio transport, via the
modern `McpServer` + `registerTool` API. Do NOT reintroduce `server.tool()` or
`setRequestHandler(CallToolRequestSchema, ...)` — those are deprecated, and the
switch statement they required is what this structure replaced.

Every tool goes through `defineTool` in `server/register.ts`, which applies the
`comfyui_` name prefix, the annotations, and the connection gate uniformly.
Handlers can assume they are connected when `requiresConnection` is set.

Resources and prompts stay on the low-level handlers (`server.server`), because
the resource set is enumerated from live ComfyUI state and `registerResource`
models static resources only.

### ComfyUI API
- REST endpoints: `/prompt`, `/queue`, `/history`, `/object_info`, `/system_stats`, `/view`
- WebSocket: `/ws` for real-time execution progress
- Workflows are JSON objects with numbered node IDs

### Auto-Discovery
Discovery order: ENV var → config file → desktop app paths → port scanning (8188, 8000, 8189, 8190). ComfyUI Desktop commonly serves on 8000, not 8188

### Capability Detection
Parses `/object_info` response to detect:
- Available nodes (indicates features like ControlNet, AnimateDiff)
- Model options from loader node inputs
- Available samplers/schedulers from KSampler

### Dynamic Workflows
`workflows/builder.ts` generates workflows based on detected capabilities:
- Standard workflow for SD 1.5/SDXL (CheckpointLoaderSimple)
- Flux workflow for Flux models (UNETLoader + DualCLIPLoader)

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Build, then run the test suite
npm start            # Run the server
npm run dev          # Watch mode for development
npm run inspector    # Test with MCP Inspector
```

## Testing

Unit tests use the Node built-in runner (`node:test`) — no test framework
dependency. Tests live beside the code as `*.test.ts` and run from `dist/`
after compilation, so `npm test` builds first.

Note `node --test dist/` (a bare directory) would execute `dist/index.js` as
a test and hang forever on stdio. The script globs `dist/**/*.test.js`
instead; keep it that way.

Cover pure logic in unit tests: pagination boundaries, response shaping,
parsing, and any bug being fixed. Anything needing a live ComfyUI is not a
unit test — verify those against a running instance and say so in the commit.

For end-to-end checks:
1. Run ComfyUI locally
2. Use `npm run inspector` to interact with tools
3. Or configure in Claude Desktop and test via Claude

Unit tests answer "does this function behave"; the suites in `evals/` answer
"can a model get the job done with these tools", which is the thing an MCP
server is actually judged on. `evals/library.xml` needs no running ComfyUI.
See `evals/README.md` for how to run it and how to write a question that is
worth adding.

## Git Workflow

This repo has high risk-bearing capacity. Push directly to `main`:

- **Low-risk changes** — push directly, no ceremony.
- **Significant changes** — push directly once they pass `npm test` and have
  no known issues.
- **Prefer small, frequent pushes** over large batched ones, so any single
  change is easy to identify and roll back.

Do not batch unrelated work into one commit. A commit that mixes a bug fix
with a refactor cannot be reverted without losing the fix.

## Key Files to Understand

1. **src/server/tools/** - Tool definitions, one module per domain
2. **src/server/register.ts** - How a tool becomes an MCP tool
3. **src/server/connection.ts** - Discovery and reconnection behaviour
4. **src/utils/response.ts** - Pagination, compact JSON, truncation
5. **src/client/comfyui.ts** - All ComfyUI API interactions
6. **src/capabilities/index.ts** - How features are detected
7. **src/workflows/builder.ts** - How workflows are dynamically built
8. **src/tools/examples/index.ts** - Example workflows, templates, recommendations
9. **src/jobs/manager.ts** - Async job tracking for workflow execution
10. **src/db/index.ts** - SQLite database for notes and custom templates

## Common Tasks

### Adding a New Tool
1. Define the Zod schema in the appropriate `tools/*.ts` file, ending in
   `.strict()` so misspelled arguments are rejected rather than ignored
2. Implement the tool function there; return a **declared interface**, not a
   `Record<string, unknown>` and never a JSON string. A tool that returns a
   string cannot populate `structuredContent`, and a renderer cannot be
   written over it without casts
3. Register it with `defineTool` in the matching `server/tools/*.ts` module
4. Give it a `title`, a description covering args/returns/errors, and
   `readOnlyHint` / `idempotentHint` / `openWorldHint`. Those three are
   required by the type; `destructiveHint` is derived from `readOnlyHint`, so
   set it by hand only on a writing tool that is *not* destructive
5. Set `requiresConnection: true` if it touches ComfyUI
6. Report a failure by throwing a named error class and mapping it to
   `errorResult` with a hint, not by returning a success that carries an
   `error` field - the caller has to be able to tell the two apart
7. If another tool resolves the failure, **name it**. An error that describes
   a problem and does not name the tool that fixes it makes that tool
   undiscoverable at the one moment it is needed. Check the hint answers
   "so what do I call now?"

   Throw a `ToolError` (`utils/errors.ts`) with the hint as its second
   argument, rather than a bare `Error`. `defineTool` surfaces it, so the
   guidance lives next to the code that knows why the failure happened, and
   no handler needs a `catch` to attach it. Subclass `ToolError` when the
   same failure is raised from several places - `PromptNotFoundError`,
   `NodeNotFoundError`, `NoTypeFilterError` all do.

   Resources and prompts have no ToolResult, so `index.ts` folds the hint
   into the message with `describeError` on those paths.

Do not add the `comfyui_` prefix by hand — `defineTool` applies it.

Only declare `outputSchema` where the response shape is genuinely fixed. The
SDK validates every response against it and fails the whole call on a
mismatch, including on branches you did not think about (empty results, the
final page, error paths).

### Running a Workflow

There is one execution path. `runWorkflowAsync` submits, creates the job, and
returns `{ task, completion }`; a synchronous run is that plus `await
completion`. Do not add a second implementation for sync - that is what these
two were, and they drifted in three user-visible ways before being merged.

Image collection lives in `tools/outputs.ts` and is shared. Saving and
inlining are separate decisions: the file is written unless Docker says
otherwise, and `outputMode` controls only whether the bytes also travel
inline, which is what `outputModeSchema` has always documented.

### Adding a New Model Architecture

One row in `src/architectures/registry.ts`:

```ts
{
  id: "myarch",
  displayName: "My Architecture",
  detect: { checkpoints: /myarch/i, unets: /myarch/i },
  workflow: "flux",          // which graph shape builder.ts produces
  guide: "myarch",           // omit if no prompting guide exists yet
  advice: "One line of prompting steer.",
  priority: 50,              // higher = more specific; beats the generic bases
}
```

Everything else follows: `capabilities/` detects it, both status tools advise
on it, `get_prompting_guide` resolves it (by id, alias or raw filename), and
`recommend_workflow` reports it. Add a `MODEL_PATTERNS` row in
`tools/examples/recommend.ts` if it needs specific steps/CFG/resolution, and a
builder function in `workflows/builder.ts` only if it needs a graph shape that
does not exist yet.

**Keep `id` and `workflow` distinct.** `id` is identity ("this is a Qwen
model"); `workflow` is graph shape ("loads through UNETLoader +
DualCLIPLoader, like Flux"). Conflating them is what previously forced 24 of
36 model patterns to claim they were Flux, which then sent their users to the
Flux prompting guide.

`legacyFlag` is only for the five architectures that predate the registry —
their `hasSD15`/`hasSDXL`/`hasSD3`/`hasFlux`/`hasCascade` booleans are public
in `get_capabilities` output. New architectures do not get a boolean; they
appear in `detectedArchitectures`.

### Adding a New Example Workflow
Add entry to the appropriate category file in `tools/examples/` (e.g., `flux.ts`, `sdxl.ts`, `video.ts`) with the image URL containing embedded workflow metadata. Then export it from `tools/examples/data.ts`.

## Response Conventions

Every tool response is context the model pays for on each call, and a single
careless response can cost more than the whole conversation around it. The
helpers in `utils/response.ts` exist to prevent that — use them.

- **Never return an unbounded collection.** Spread `paginationFields` into the
  schema and run results through `paginate()`. Report `total`, `count`,
  `offset`, `has_more`, and `next_offset` so the agent can page deliberately.
  `list_nodes` once returned 440KB (~110k tokens) on a modded install.
- **Use `jsonText()`, not `JSON.stringify(x, null, 2)`.** Indentation is pure
  token cost for a machine reader.
- **Listings identify; detail tools elaborate.** A search result carries only
  enough to pick one item. Parameter lists, default settings, workflow JSON,
  and model download URLs belong in the tool that takes an id.
- **Offer a `detail` projection** (`names` / `summary` / `full`) when callers
  legitimately want different depths.
- **Cap category/facet maps.** A modded install has ~400 node categories;
  the full map cost 4x the page of nodes it labelled.
- **Never return the same data twice** in one response (e.g. a rendered
  markdown view plus the raw JSON of the same object). This is also why
  `PageEnvelope` is separate from `Page<T>`: a tool spreads the envelope and
  names its own item key, so a page is never emitted as both `items` and
  `jobs`.
- **Offer `response_format`** on data tools by spreading `responseFormatField`
  and returning through `formattedResult`. The default is `json`, not the
  markdown the MCP guidance suggests — the reader is a model, and compact
  JSON is both smaller than the equivalent markdown and directly parseable.
  The reasoning is recorded on `responseFormatField`; do not "correct" the
  default without reading it.
- **Say it once.** A hint that repeats what the message already said, or a
  message that wraps a complete error in another sentence restating it, is
  paid for twice. `reconnect` was emitting its URL list twice and its guidance
  three times.
- **Render listings through `utils/render.ts`.** `renderListing` owns the
  title/facets/rows/footer shape, so every listing reads the same way and the
  footer always names the next offset. Supply rows, not a whole document. The
  renderer lives beside the logic in `tools/*` where a logic module exists,
  and inline in `server/tools/*` where the handler reads the db or job manager
  directly.
- **Build the envelope by destructuring**, not by re-listing its fields:
  `const { items, ...envelope } = paginate(...)`, then `{ ...envelope, jobs: items }`.
  Re-listing `total/count/offset/has_more` invites getting the optional
  `next_offset` wrong.

Measure before and after when changing a response shape — against a live
ComfyUI where the tool needs one. Put the numbers in the commit message.

## Environment

- Node.js 18+
- TypeScript with ESM modules
- Zod for schema validation
- ws package for WebSocket
- sharp for image processing and SVG rendering
- better-sqlite3 for persistent storage (notes, templates)

## Notes

- All console output uses `console.error` (stdout is reserved for MCP protocol)
- Server works even if ComfyUI is not running (setup tools remain available)
- `tools/launch.ts` is the only module that spawns processes. Anything it starts must be `detached` with `stdio: "ignore"` — inherited stdout would corrupt the MCP stream, and an attached child would die with the server
- Image outputs can be base64 (inline) or saved to files based on size threshold
- Example workflows are extracted from PNG metadata in ComfyUI docs images
