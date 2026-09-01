# CLAUDE.md - ComfyUI MCP Server

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server that enables AI
assistants to interact with ComfyUI for generating images, audio, and video. The
server is self-configuring, automatically discovering ComfyUI instances and
their capabilities.

**It is a COMPANION to the official Comfy MCP (`Comfy-Org/comfy-mcp`), not a
replacement.** It is meant to be mounted alongside that server and carries only
what that server does worse or cannot do at all. Installing ComfyUI, managing
models and custom nodes, node introspection, and server lifecycle are all
deliberately absent - it wraps comfy-cli for those and tracks ComfyUI's own
releases, which this server would be reimplementing by hand.

Before adding a tool, ask what the official server already does with it. If the
answer is "the same thing or better", it does not belong here. See "Coexisting
With the Official Comfy MCP" below.

## Architecture

```
src/
├── index.ts                 # Entry point: start()
├── config.ts                # Configuration management
├── constants.ts             # Shared limits (CHARACTER_LIMIT, page sizes)
├── context.ts               # Server context (shared state)
├── server/
│   ├── bootstrap.ts        # start(profile): the wiring both entries share
│   ├── instructions.ts     # Handshake text: canonical flows, the Comfy seam
│   ├── connection.ts       # Discovery, health cache, restart watches
│   ├── register.ts         # defineTool: prefix, annotations, conn gate
│   └── tools/              # Tool registration, one file per domain
│       ├── setup.ts        # status (incl. architectures), reconnect
│       ├── discovery.ts    # build_node
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
│   ├── workflow-version.ts # Content hash + the write-conflict policy
│   ├── generate.ts         # Workflow/image schemas, get_image
│   ├── generate-async.ts   # Submit a workflow and track it to completion
│   ├── outputs.ts          # Collect a finished prompt's images, and its text by node id
│   ├── iteration.ts        # Draft-then-final planning; what a seed carries over
│   ├── describe.ts         # Image -> tags/prose, orchestration and rendering
│   ├── describe/
│   │   └── backends.ts     # One row per tagger/captioner; node-type candidates
│   ├── upload.ts           # Put an image into ComfyUI's input dir for LoadImage
│   ├── models.ts           # Model/node listing and building
│   ├── queue.ts            # Queue management tools
│   ├── install.ts          # Install detection + get_status
│   ├── scan-model.ts       # Is this checkpoint safe to torch.load?
│   ├── scan/
│   │   ├── pickle.ts       # Opcode walker; never unpickles
│   │   ├── zip.ts          # Reads one member of a torch.save archive
│   │   └── signatures.ts   # Dangerous / suspicious / expected imports
│   ├── tags.ts             # Danbooru tag search + co-occurrence lookup
│   ├── svg.ts              # SVG rendering to PNG
│   ├── fonts.ts            # Font download and management
│   └── examples/           # Example workflows and templates
│       ├── index.ts        # Main exports
│       ├── data.ts         # Aggregated example data
│       ├── types.ts        # Type definitions
│       ├── workflow-fetch.ts # Pull a graph out of a docs PNG or .json
│       ├── templates.ts    # Template system (search/get/save)
│       ├── recommend.ts    # Workflow recommendations
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
│   ├── prompting-guide.ts  # Public entry point; re-exports prompting/
│   └── prompting/          # One guide per architecture, split by family
│       ├── types.ts        # Guide shape: structure, specialTags, starters, models
│       ├── render.ts       # Section rendering (progressive disclosure)
│       ├── index.ts        # Aggregation, lookup, the index table
│       └── guides/         # stable-diffusion, flux, anime, dit, video, audio
│           └── vocabulary.ts  # Shared Danbooru tags + ComfyUI prompt syntax
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

comfyui-tabbridge/           # Companion ComfyUI custom node (Python, adds no nodes)
├── README.md               # Includes how to link it into custom_nodes
├── tab_bridge.py           # Serves /tabs/state, /tabs/flush, /tabs/reload
└── web/js/tab_bridge.js    # Frontend half; reports open tabs to the server
```

### Optional: ComfyUI-Autocomplete-Plus

`tools/tags.ts` backs `comfyui_search_tags` and `comfyui_related_tags`. Its
data comes from [ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus),
which downloads two CSVs from Hugging Face and serves them over ComfyUI's own
HTTP server:

- `GET /autocomplete-plus/csv/danbooru/tags/base` — `tag,category,count,alias`
- `GET /autocomplete-plus/csv/danbooru/tags_cooccurrence/base` — `tagA,tagB,count`

Danbooru category codes are positional: `0` general, `1` artist, `2` unused,
`3` copyright, `4` character, `5` meta.

That node does its searching in the browser, so this server does its own:
fetch once, index in memory, answer from the index. The index is cached per
base url and dropped by `clearConnectionState()`, since a reconnect may reach
a different instance.

Unlike TabBridge this is a **third-party** node and not vendored here. It is
also genuinely optional: without it both tools answer from the curated
`DANBOORU_VOCABULARY` in the prompting guides and set `source: "builtin"`, so
callers can tell a small answer from a full one. Never make these tools fail
when it is absent — a smaller answer beats no answer.

### comfyui-tabbridge

The other half of the safe-write contract. `tools/workflow-files.ts` cannot do
`flush -> read + diff -> write -> reload` without these routes, so the two ship
together rather than versioning half a protocol.

ComfyUI loads it from `custom_nodes`, which is outside this repo, so a working
install has that path **linked** here - a directory junction on Windows, a
symlink elsewhere. Git stores the directory but never the link: a clone that
could create things outside its own tree would be a code-execution vector, so
this is a post-clone step by design rather than by omission.

`npm run link:tabbridge` is that step. It finds ComfyUI by asking a running
instance for its own argv (`/system_stats` reports it, so `--base-directory`
is exact rather than guessed), is safe to re-run, and refuses to delete a real
directory that is already at the target. `--check` reports without changing
anything.

Edits here reach ComfyUI on its next restart, not immediately: the Python
module is already imported.

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
- Single-encoder workflow for Anima/Qwen (UNETLoader + one CLIPLoader + VAELoader)

## Commands

```bash
npm install          # Install dependencies
npm run link:tabbridge  # Link the companion custom node into ComfyUI (once per clone)
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
a test and hang forever on stdio, so the runner must always pass explicit
files. `scripts/run-tests.mjs` walks `dist/` for `*.test.js` and hands those
over.

That script exists because the obvious spelling is version-dependent:
`node --test "dist/**/*.test.js"` relies on the runner expanding the glob,
which only Node 21+ does. On the 18 and 20 that `engines` claims to support,
the pattern is taken as a literal path and the whole suite dies with "Could
not find". Letting the shell expand it instead is no better - `**` needs bash
with globstar, npm often runs scripts through `sh`, and Windows is a supported
dev platform here. Doing the walk in JS is the only spelling that works
everywhere. It also exits non-zero on a missing or empty `dist/`, so a broken
build cannot report a green suite.

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

### Coexisting With the Official Comfy MCP

`Comfy-Org/comfy-mcp` is expected to be mounted alongside this server. There is
one entry point and one mode: companion. The standalone/companion profile split
that briefly existed is gone.

**What was removed, and what covers it now.** `start_comfyui`/`restart_comfyui`
-> `launch_comfyui`/`restart_comfyui`; `get_install_guide` -> `install_comfyui`;
`get_model_guide`/`get_download_url` -> `search_models` + `download_model`;
`list_nodes`/`get_node_info`/`find_nodes_by_type` -> `nodes` (one tool that
searches, inspects, filters AND graph-walks between types); `list_models` ->
`search_models`; `validate_workflow` -> theirs; `list_examples`/
`get_example_workflow` -> the Comfy template gallery.

**Steering: name the failure, not the preference.** MCP gives no way to
deprioritise another server's tools, so which one an agent reaches for is
decided by descriptions. "Prefer ours" is a claim about taste. What actually
changes the choice is a checkable fact about what theirs will do - see the
overlapping tools' descriptions, and `server/instructions.ts` for the same
thing said once at handshake.

Four facts about that server worth knowing before designing against it:

- **It cannot see runs this server submits.** `fetch_outputs` says so:
  "the run that submitted the job wrote a state file on THIS machine... Only a
  `prompt_id` this machine never submitted has no such state file
  (`download_job_not_found`)", and `jobs ls` merges those same files. So the
  two servers **cannot** split submit-from-track: whoever submits must also
  track and collect. That is why the whole run subsystem stays here, and why
  `get_image` is not a duplicate of `fetch_outputs`.
- **It has no workflow versioning.** No hash, etag, mtime check, or
  lost-update protection anywhere. `set_workflow_slot(stdout=False)` writes in
  place unconditionally, so it is a third unprotected writer into the same
  directories - alongside a human's browser tab and our own writes. Its
  architecture rule ("every tool is a passthrough to the `comfy` binary")
  means it cannot grow one before comfy-cli does.
- **`project/1` and `envelope/1` are schema versions, not content versions.**
  The first is comfy-cli project anchoring, the second its result envelope.
- **`upload_file` takes local paths only**, so it cannot reach ComfyUI's own
  output directory - which is what `upload_image`'s `from_output` copies from,
  server-side.

**The queue tools are deliberately kept.** Their `job(action="queue")` is
`comfy jobs ls`, comfy-cli's record of its own submissions. `comfyui_get_queue`
reads ComfyUI's real `/queue` and sees every job whoever sent it, which makes
it the only cross-server view of what is actually running.

**Nothing may name a tool that does not exist.**
`server/tool-references.test.ts` fails on any `comfyui_` name in any source
file that is not a registered tool. This exists because pruning twelve tools
left ~40 dangling references in error hints - invisible to the compiler and to
every other test, because they are ordinary strings. A hint naming a deleted
tool is worse than one naming nothing: it spends the agent's next call at the
exact moment the hint exists to be acted on.

### Writing a Workflow File Safely

`write_workflow` used to flush, diff, and write regardless - then report that
the human's edits "were just overwritten". The diff could not gate anything:
disk and the candidate always differ on a real edit, because differing is the
point of writing.

Detecting a *foreign* change takes three states, not two:

    base    the file as it was when this agent read it
    theirs  the file as it is on disk right now
    yours   the graph about to be written

and a foreign change is `theirs !== base`. `read_workflow` mints `base` with
`workflowVersion()` and records it in SQLite (`workflow_bases`); a write
resolves it from `expected_version`, else that record, else nothing, and
refuses on `changed` or on `exists but never read`. Creating a new file needs
no read. `force: true` is the only way past either refusal.

**Flush and reload are implicit and non-optional.** `read_workflow` flushes
open tabs BEFORE reading, so the version it records as the base includes the
human's unsaved work - a base taken without it would later call their edit "no
change" and let a write walk over it. `write_workflow` flushes again (they can
edit between the two), checks, writes, and reloads. The `skip_flush`,
`skip_reload` and `save_first` arguments are gone; each only turned the safety
off, and each already said to leave it alone. There are no standalone
`flush_workflow`/`reload_workflow` tools.

Known gap: when the official server writes a workflow in place, the human's tab
is stale and nothing here covers telling it to reload without a read+write
cycle.

Four rules to keep:

- **A successful write re-bases** to what it just wrote. Clearing the record
  instead would leave the agent's own next write unbased and refuse it.
- **Do not use `hashWorkflowStructure` here.** It runs `normalizeWorkflow`
  first, which replaces prompts and seeds with placeholders - so a human
  retyping the prompt, the likeliest edit worth saving, hashes as no change.
  A test pins the difference in both directions.
- **`diffWorkflows` must walk `definitions.subgraphs`, not just `nodes`.**
  An official gallery template is typically ONE subgraph instance at the top
  level with the whole pipeline inside it, so a diff reading `nodes` alone
  sees a Note and a SaveImage and reports "no changes" however much was
  rewritten. The refusal itself is safe either way - it goes on the content
  hash - but the diff is what the reader uses to decide whether to force.

- **The base state is per agent**, keyed by `(path, agent_id)`. Two agents
  keep two bases for one file, which is what lost-update detection wants:
  each asks only "did it change since *I* read it". The key must stay
  composite even though the db looks per-instance - it defaults to
  `~/.comfyui-mcp/data.db`, which every server on the machine opens unless
  `COMFYUI_MCP_DB_PATH` is set, so on a path-only key one agent's read
  silently re-based another's and the next write sailed through.

### Sharing One ComfyUI

ComfyUI already answers "whose job is this": `/prompt` takes a `client_id` and
`/queue` echoes it back in the tuple's `extra_data`. That is `config.agentId`
(`COMFYUI_MCP_AGENT_ID`, default `host/pid`) - stable across reconnects,
because a fresh uuid per connection silently disowned every job the previous
one submitted.

Destructive queue tools scope to that identity by default: `cancel_job`
without a `promptId` cancels only this agent's pending jobs (`scope: "all"` is
the explicit opt-in), and `interrupt` refuses when the running job belongs to
someone else unless `confirm_foreign` is set. ComfyUI has one global
`/interrupt`, so that scoping cannot live at the API - only in front of it.

### Naming a Generation

Every run through the `run_workflow` TOOL gets a name, and `get_task` /
`get_task_result` both accept a name in place of a task id. That is what
replaced the separate `name_generation` and `get_generation_by_name` tools.

`autoRunName()` (`tools/generate.ts`) supplies `run-<date>-<6 hex>` when the
caller names nothing. Three constraints, all load-bearing:

- **The `run-` prefix is a namespace a human would not type.** `jobs.name` is
  UNIQUE, but `setJobName` resolves a collision by STEALING the name -
  `UPDATE jobs SET name = NULL WHERE name = ? AND task_id != ?` - so a
  generated name landing on a human's label silently strips it off their job.
- **The random suffix is why the name is not derived from the clock alone.**
  Two runs in the same second would otherwise collide, and the second would
  steal the first's name.
- **It is assigned at the tool boundary, not inside `runWorkflowAsync`.** That
  function is also `describe_image`'s run path, and nobody recalls a captioning
  pass by name.

### Collecting Text From a Workflow

`collectTextOutputs` in `tools/outputs.ts` reads text out of a finished
prompt, and it reads it **only from node ids the caller names**. Passing no
`fromNodes` returns `[]`.

That is not a convenience default. A ComfyUI graph emits a great deal of text
through the same `outputs` channel that carries images - echoed prompts,
seeds, node debug strings, progress logging - and a tool that collects "any
string-valued field" is a context leak wearing a feature's clothes. Scoping by
node id means nothing is guessed and nothing else is admitted: `describe_image`
builds its own graph and so knows the captioner is node `"4"`.

Keep it that way. In particular:

- Do not add a boolean "collect all text" option. `comfyui_run_workflow` takes
  `collectText: string[]` for exactly this reason - naming what you want is the
  point, and the caller has the ids because it supplied the workflow.
- Do not widen `TEXT_OUTPUT_KEYS` without a reason. It is an allowlist, and
  the field a debug node logs under is also a string-valued field.
- Per-node and total caps stay. A caption is a sentence; anything much larger
  is noise.

### Adding an Image-to-Text Backend

**First, what a backend is for.** None of them read an image better than the
model calling them does - Claude has vision, and a tool positioned as "run
this to find out what is in the image" is a downgrade dressed as a feature.
They answer a narrower question the caller genuinely cannot:

> what text would have been paired with an image like this in training data.

A backend's output is a worked example of a *prompt*, not a description. The
rule that follows, and which `describe_image`'s description and both `hintFor`
branches state: where a backend disagrees with the caller's own reading, the
CALLER is right about the image and the BACKEND is right about the prompt. A
tag WD14 misses is not a tag the image lacks - it is a tag that will not fire.

Write `goodFor` in those terms. A row that is merely a good captioner earns no
place here; one whose vocabulary matches what the model was trained on does.
It is also why JoyCaption outranks Florence-2 for prose despite Florence-2
being the better-known model: JoyCaption was built to caption diffusion
training sets, which is exactly the job.

Detection and segmentation are **not** this registry's job. Purpose-built
models - SAM3, Grounding DINO, the YOLO family - beat a captioner at boxes and
masks by a wide margin. If coordinates are wanted, that is a new row for a
real detector, not a `task` parameter on Florence-2.

One row in `src/tools/describe/backends.ts`. Two things about ComfyUI make the
rows less uniform than they look, and both bite silently:

- **`nodeTypes` is a list.** Popular nodes get forked, and the forks rename
  the class. JoyCaption has at least four wrappers. Candidates resolve against
  the live `object_info` and the first one present wins, the same way
  `resolveClipType()` handles `clipTypeHints`.
- **Only an `OUTPUT_NODE` reaches `history[...].outputs`.** WD14Tagger is one;
  Florence2Run and JoyCaption are not - they return a plain STRING, so their
  graphs must end in a preview node (`terminalNode`, defaulting to core's
  `PreviewAny`). Without one the graph submits happily and returns nothing,
  which is why `resolveBackend` treats a missing preview node as "unavailable"
  rather than running it.

Read the node's own source for its `INPUT_TYPES` and return shape rather than
inferring from docs - the output index in particular. JoyCaption returns
`("query","caption")` and Florence2Run returns `("image","mask","caption",
"data")`, so index 0 is the wrong one in both.

### Changing the Model Scanner

`scan_model` walks a pickle's opcodes to report what `torch.load` would import,
and never unpickles. Three things about it are load-bearing.

**The opcode table must stay complete.** `src/tools/scan/pickle.ts` lists every
opcode of protocols 0-5 with its argument WIDTH, and an unknown opcode stops
the walk with `truncated: true` rather than assuming zero width. That is not
caution for its own sake: one wrong width leaves the cursor inside a payload,
every opcode after it is misread, and a file carrying a real exploit reports
clean. Adding an opcode means adding its width, not defaulting it.

**Signatures are matched twice, and that redundancy is the point.** The walker
does not simulate the stack, so `STACK_GLOBAL` is resolved from the last two
string constants, honouring the memo. A crafted stream can break that pairing.
So `signatures.ts` is also matched against the raw string constants
(`danglingDangerousConstants`), which an attacker cannot avoid: `subprocess`
has to appear in the file as text either way. Do not drop either half.

**`EXPECTED` does not override `DANGEROUS`.** `classifyImport` checks dangerous
first on purpose - `torch` is ordinary and `torch.load` is a second unpickle
hidden inside the first. Reordering those two loops is a silent hole.

`_codecs.encode` is on `EXPECTED` while `codecs` is on `SUSPICIOUS`, because
torch writes the former for every non-ASCII string it stores. A scanner that
flags every real checkpoint teaches its user to ignore it, which is worse than
not having one.

The unit tests build their fixtures byte by byte rather than checking in a
`.ckpt`; the opcode table was additionally validated against 75 pickles written
by CPython's own pickler across protocols 0-5, plus stored, deflated and ZIP64
archives.

### Running a Workflow

There is one execution path. `runWorkflowAsync` submits, creates the job, and
returns `{ task, completion }`; a synchronous run is that plus `await
completion`. Do not add a second implementation for sync - that is what these
two were, and they drifted in three user-visible ways before being merged.

Image collection lives in `tools/outputs.ts` and is shared. Saving and
inlining are separate decisions: the file is always written, and `outputMode`
controls only whether the bytes also travel inline, which is what
`outputModeSchema` has always documented.

### Adding a New Model Architecture

One row in `src/architectures/registry.ts`:

```ts
{
  id: "myarch",
  displayName: "My Architecture",
  detect: { checkpoints: /myarch/i, unets: /myarch/i },
  workflow: "flux",          // which graph shape builder.ts produces
  guide: "myarch",           // key into PROMPTING_GUIDES - see below
  // clipTypeHints: ["qwen_image"],  // unet_clip only; see below
  advice: "One line of prompting steer.",
  priority: 50,              // higher = more specific; beats the generic bases
}
```

**Every row must carry a `guide`, and it must resolve.** Two tests enforce
this in both directions: no architecture may point at a missing guide, and no
guide may be unreachable from any architecture. So adding a row means adding a
guide to `src/resources/prompting/guides/` in the same change. A row without
one used to be allowed, and the result was `get_capabilities` telling the
agent "no dedicated prompting guide yet" for half the table.

Everything else follows: `capabilities/` detects it, both status tools advise
on it, `get_prompting_guide` resolves it (by id, alias or raw filename), and
`recommend_workflow` reports it. Add a `MODEL_PATTERNS` row in
`tools/examples/recommend.ts` if it needs specific steps/CFG/resolution, and a
builder function in `workflows/builder.ts` only if it needs a graph shape that
does not exist yet.

**Prompting style is not graph shape either.** The booru-tag anime models
(`illustrious`, `noobai`, `pony`, `animagine`, `anima`) are SDXL-shaped and
were once *aliases* of `sdxl`, which handed every one of their users the
natural-language SDXL guide — close to the inverse of what they want. If a new
architecture wants a fixed tag vocabulary, a tag order, or quality/rating
tokens, it needs its own row and its own guide, however familiar its graph
looks. Fill in `structure` and `specialTags` on the guide when so.

**There are three graph shapes, not two.** `standard` is
CheckpointLoaderSimple; `flux` is UNETLoader + **Dual**CLIPLoader; `unet_clip`
is UNETLoader + a **single** CLIPLoader. Picking `flux` for a single-encoder
model builds a graph naming a second encoder that model does not have, which
is what Anima and Qwen-Image were getting. A `unet_clip` row must also set
`clipTypeHints` — the CLIPLoader `type` combo moves between ComfyUI versions,
so the builder takes the first hint the running instance actually offers
rather than a hardcoded string. Use `isUnetShape()` rather than
`workflow === "flux"` whenever you mean "loads a bare UNET"; several call
sites meant that and tested the other thing.

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

- Node.js 24+ (Active LTS)
- TypeScript with ESM modules
- Zod for schema validation
- ws package for WebSocket
- sharp for image processing and SVG rendering
- better-sqlite3 for persistent storage (notes, templates)

## Notes

- All console output uses `console.error` (stdout is reserved for MCP protocol)
- Server works even if ComfyUI is not running (setup tools remain available)
- Nothing in `src/` imports `child_process`, and nothing should. Launching and restarting ComfyUI are the official Comfy MCP's `launch_comfyui` / `restart_comfyui`. If a process ever has to be spawned again, it must be `detached` with `stdio: "ignore"` — inherited stdout would corrupt the MCP stream, and an attached child would die with the server
- Image outputs can be base64 (inline) or saved to files based on size threshold
- Example workflows are extracted from PNG metadata in ComfyUI docs images
