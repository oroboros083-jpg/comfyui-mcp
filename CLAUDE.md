# CLAUDE.md - ComfyUI MCP Server

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server that enables AI assistants to interact with ComfyUI for generating images, audio, and video. The server is designed to be self-configuring, automatically discovering ComfyUI instances and their capabilities.

## Architecture

```
src/
├── index.ts                 # Main MCP server entry point
├── config.ts                # Configuration management
├── client/
│   ├── comfyui.ts          # REST API client for ComfyUI
│   └── websocket.ts        # WebSocket client for progress tracking
├── discovery/
│   └── index.ts            # Auto-discovery of ComfyUI instances
├── capabilities/
│   └── index.ts            # Capability detection from object_info
├── workflows/
│   └── builder.ts          # Dynamic workflow generation
└── tools/
    ├── generate.ts         # Image generation tools
    ├── models.ts           # Model listing tools
    ├── queue.ts            # Queue management tools
    ├── install.ts          # Installation assistance
    ├── download.ts         # Model download tools
    └── examples.ts         # Example workflow fetching
```

## Key Concepts

### MCP Server Pattern
The server uses `@modelcontextprotocol/sdk` with stdio transport. Tools are defined with Zod schemas and registered via `setRequestHandler` for `ListToolsRequestSchema` and `CallToolRequestSchema`.

### ComfyUI API
- REST endpoints: `/prompt`, `/queue`, `/history`, `/object_info`, `/system_stats`, `/view`
- WebSocket: `/ws` for real-time execution progress
- Workflows are JSON objects with numbered node IDs

### Auto-Discovery
Discovery order: ENV var → config file → desktop app paths → port scanning (8188-8190)

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
npm start            # Run the server
npm run dev          # Watch mode for development
npm run inspector    # Test with MCP Inspector
```

## Testing

No test framework is currently set up. To test:
1. Run ComfyUI locally
2. Use `npm run inspector` to interact with tools
3. Or configure in Claude Desktop and test via Claude

## Key Files to Understand

1. **src/index.ts** - Tool definitions, request handlers, server initialization
2. **src/client/comfyui.ts** - All ComfyUI API interactions
3. **src/capabilities/index.ts** - How features are detected
4. **src/workflows/builder.ts** - How workflows are dynamically built
5. **src/tools/examples.ts** - PNG metadata extraction for example workflows

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
Add entry to `EXAMPLE_WORKFLOWS` in `tools/examples.ts` with the image URL containing embedded workflow metadata.

## Environment

- Node.js 18+
- TypeScript with ESM modules
- Zod for schema validation
- ws package for WebSocket

## Notes

- All console output uses `console.error` (stdout is reserved for MCP protocol)
- Server works even if ComfyUI is not running (setup tools remain available)
- Image outputs can be base64 (inline) or saved to files based on size threshold
- Example workflows are extracted from PNG metadata in ComfyUI docs images
