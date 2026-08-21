# CLAUDE.md - ComfyUI MCP Server

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server that enables AI assistants to interact with ComfyUI for generating images, audio, and video. The server is designed to be self-configuring, automatically discovering ComfyUI instances and their capabilities.

## Architecture

```
src/
├── index.ts                 # Main MCP server entry point
├── config.ts                # Configuration management
├── constants.ts             # Shared limits (CHARACTER_LIMIT, page sizes)
├── context.ts               # Server context (shared state)
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
│   ├── generate.ts         # Sync workflow execution
│   ├── generate-async.ts   # Async workflow execution
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
└── utils/
    ├── image.ts            # Image processing utilities
    ├── response.ts         # Pagination, compact JSON, truncation
    └── logging.ts          # MCP logging utilities
```

## Key Concepts

### MCP Server Pattern
The server uses `@modelcontextprotocol/sdk` with stdio transport. Tools are defined with Zod schemas and registered via `setRequestHandler` for `ListToolsRequestSchema` and `CallToolRequestSchema`.

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

1. **src/index.ts** - Tool definitions, request handlers, server initialization
2. **src/client/comfyui.ts** - All ComfyUI API interactions
3. **src/capabilities/index.ts** - How features are detected
4. **src/workflows/builder.ts** - How workflows are dynamically built
5. **src/tools/examples/index.ts** - Example workflows, templates, and recommendations
6. **src/jobs/manager.ts** - Async job tracking for workflow execution
7. **src/db/index.ts** - SQLite database for notes and custom templates

## Common Tasks

### Adding a New Tool
1. Define schema with Zod in the appropriate `tools/*.ts` file
2. Implement the tool function
3. Add to `TOOLS` object in `index.ts`
4. Add case in the switch statement in `CallToolRequestSchema` handler

### Adding a New Model Architecture
1. Update `capabilities/index.ts` to detect the new model type
2. Add workflow builder function in `workflows/builder.ts`
3. Update `selectWorkflowType` to choose it appropriately

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
  markdown view plus the raw JSON of the same object).

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
