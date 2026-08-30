# ComfyUI MCP Server

> **This is a companion server. Mount it alongside the official
> [Comfy MCP](https://github.com/Comfy-Org/comfy-mcp).** It carries only what
> that server does worse or cannot do at all — prompting knowledge, tag
> vocabulary, versioned workflow-file editing against a live browser tab, the
> real ComfyUI queue, and a run path that takes a graph object rather than a
> file path. Installing ComfyUI, managing models and custom nodes, node
> introspection and server lifecycle are deliberately absent: `comfy-mcp` wraps
> comfy-cli for all of it and tracks ComfyUI's releases.
>
> **Breaking, if you upgraded from an earlier version.** Seventeen tools were
> removed or renamed. Nothing needs doing unless you referenced a tool name by
> hand — in a permission allowlist, a saved prompt, or a script:
>
> | Removed | Use instead |
> |---|---|
> | `comfyui_start_comfyui`, `comfyui_restart_comfyui` | `launch_comfyui`, `restart_comfyui` (official) |
> | `comfyui_get_install_guide` | `install_comfyui` (official) |
> | `comfyui_get_model_guide`, `comfyui_get_download_url`, `comfyui_list_models` | `search_models`, `download_model` (official) |
> | `comfyui_list_nodes`, `comfyui_get_node_info`, `comfyui_find_nodes_by_type` | `nodes` (official) — searches, inspects, filters and graph-walks |
> | `comfyui_validate_workflow` | `validate_workflow` (official) — takes a path, so write the file first |
> | `comfyui_list_examples`, `comfyui_get_example_workflow` | `search_templates`, `get_template` (official), or `comfyui_recommend_workflow` |
> | `comfyui_get_capabilities` | `comfyui_get_status` — it reports the detected architectures |
> | `comfyui_flush_workflow`, `comfyui_reload_workflow` | Automatic. `comfyui_read_workflow` flushes, `comfyui_write_workflow` flushes and reloads |
> | `comfyui_name_generation` | Pass `name` to `comfyui_run_workflow` |
> | `comfyui_get_generation_by_name` | `comfyui_get_task_result` accepts a name or an id |
> | `comfyui_search_templates` and friends | Renamed `comfyui_search_user_snippets` etc. — they search YOUR saved workflows, not the Comfy gallery |
>
> `skip_flush`, `skip_reload` and `save_first` are gone too; each only turned a
> safety off.

- [ComfyUI MCP Server](#comfyui-mcp-server)
  - [Let Your AI Install This For You](#let-your-ai-install-this-for-you)
  - [What is This?](#what-is-this)
  - [Key Features](#key-features)
    - [Self-Configuring](#self-configuring)
    - [Works Without ComfyUI Running](#works-without-comfyui-running)
    - [Workflow-First Architecture](#workflow-first-architecture)
    - [77 Example Workflows](#77-example-workflows)
    - [26 Model Architectures, 26 Prompting Guides](#26-model-architectures-26-prompting-guides)
    - [Template System](#template-system)
    - [Workflow Composition Tools](#workflow-composition-tools)
    - [Safe Workflow-File Editing](#safe-workflow-file-editing)
    - [Responses Sized for a Model](#responses-sized-for-a-model)
  - [Quick Start Guide](#quick-start-guide)
    - [Step 1: Install ComfyUI](#step-1-install-comfyui)
    - [Step 2: Download a Model](#step-2-download-a-model)
    - [Step 3: Configure Your AI Assistant](#step-3-configure-your-ai-assistant)
    - [Step 4: Start Generating!](#step-4-start-generating)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Option 1: Docker](#option-1-docker)
      - [Claude Desktop](#claude-desktop)
      - [Claude Code (CLI)](#claude-code-cli)
      - [Cursor](#cursor)
      - [Windsurf](#windsurf)
      - [Cline (VS Code Extension)](#cline-vs-code-extension)
      - [Linux (Any Client)](#linux-any-client)
      - [Port Configuration](#port-configuration)
      - [Docker Caveats](#docker-caveats)
    - [Option 2: From Source](#option-2-from-source)
    - [Optional: ComfyUI-TabBridge](#optional-comfyui-tabbridge)
  - [Tools Reference](#tools-reference)
    - [Shared Parameters](#shared-parameters)
    - [Setup \& Status Tools](#setup--status-tools)
      - [`comfyui_get_status`](#comfyui_get_status)
      - [`comfyui_reconnect`](#comfyui_reconnect)
    - [Template \& Workflow Library Tools](#template--workflow-library-tools)
      - [`comfyui_search_user_snippets`](#comfyui_search_user_snippets)
      - [`comfyui_get_user_snippet`](#comfyui_get_user_snippet)
      - [`comfyui_save_user_snippet`](#comfyui_save_user_snippet)
      - [`comfyui_delete_user_snippet`](#comfyui_delete_user_snippet)
      - [`comfyui_extract_workflow`](#comfyui_extract_workflow)
      - [`comfyui_recommend_workflow`](#comfyui_recommend_workflow)
      - [`comfyui_plan_iteration`](#comfyui_plan_iteration)
      - [`comfyui_get_prompting_guide`](#comfyui_get_prompting_guide)
      - [`comfyui_search_tags`](#comfyui_search_tags)
      - [`comfyui_related_tags`](#comfyui_related_tags)
    - [Generation Tools](#generation-tools)
      - [`comfyui_run_workflow`](#comfyui_run_workflow)
      - [`comfyui_get_image`](#comfyui_get_image)
      - [`comfyui_upload_image`](#comfyui_upload_image)
      - [`comfyui_describe_image`](#comfyui_describe_image)
    - [Workflow File Tools](#workflow-file-tools)
      - [`comfyui_list_open_workflows`](#comfyui_list_open_workflows)
      - [`comfyui_read_workflow`](#comfyui_read_workflow)
      - [`comfyui_write_workflow`](#comfyui_write_workflow)
    - [Workflow Composition Tools](#workflow-composition-tools-1)
      - [`comfyui_build_node`](#comfyui_build_node)
    - [Discovery Tools](#discovery-tools)
    - [Task \& Queue Management](#task--queue-management)
      - [`comfyui_get_task`](#comfyui_get_task)
      - [`comfyui_get_task_result`](#comfyui_get_task_result)
      - [`comfyui_list_tasks`](#comfyui_list_tasks)
      - [`comfyui_cancel_task`](#comfyui_cancel_task)
      - [`comfyui_get_queue`](#comfyui_get_queue)
      - [`comfyui_cancel_job`](#comfyui_cancel_job)
      - [`comfyui_interrupt`](#comfyui_interrupt)
      - [`comfyui_get_history`](#comfyui_get_history)
    - [Agent Memory Tools](#agent-memory-tools)
      - [`comfyui_save_note`](#comfyui_save_note)
      - [`comfyui_get_notes`](#comfyui_get_notes)
      - [`comfyui_search_notes`](#comfyui_search_notes)
      - [`comfyui_delete_note`](#comfyui_delete_note)
      - [`comfyui_list_topics`](#comfyui_list_topics)
    - [User Preferences Tools](#user-preferences-tools)
      - [`comfyui_get_user_preferences`](#comfyui_get_user_preferences)
    - [SVG \& Font Tools](#svg--font-tools)
      - [`comfyui_render_svg`](#comfyui_render_svg)
      - [`comfyui_download_font`](#comfyui_download_font)
      - [`comfyui_list_fonts`](#comfyui_list_fonts)
  - [Resources and Prompts](#resources-and-prompts)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
    - [Config File](#config-file)
  - [How It Works](#how-it-works)
    - [Auto-Discovery](#auto-discovery)
    - [Capability Detection](#capability-detection)
    - [Workflow Execution](#workflow-execution)
    - [Image Output](#image-output)
  - [Security Notes](#security-notes)
  - [Example Conversations](#example-conversations)
    - [First-Time Setup](#first-time-setup)
    - [Generate Images with Templates](#generate-images-with-templates)
    - [Custom Workflow Composition](#custom-workflow-composition)
  - [Development](#development)
    - [Building](#building)
    - [Running Locally](#running-locally)
    - [Testing](#testing)
    - [Evals](#evals)
    - [Docker Build](#docker-build)
    - [Testing with MCP Inspector](#testing-with-mcp-inspector)
  - [Troubleshooting](#troubleshooting)
    - [ComfyUI not detected](#comfyui-not-detected)
    - [Models not found](#models-not-found)
    - [Generation fails](#generation-fails)
    - [Workflow edits keep reverting](#workflow-edits-keep-reverting)
  - [Contributing](#contributing)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)


[![Build and Publish](https://github.com/oroboros083-jpg/comfyui-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/oroboros083-jpg/comfyui-mcp/actions/workflows/publish.yml)

An MCP (Model Context Protocol) server that enables AI assistants like Claude to interact with [ComfyUI](https://github.com/comfyanonymous/ComfyUI) for generating images, audio, video, and more.

---

## Let Your AI Install This For You

Copy and paste this prompt to your AI assistant (Claude, Cursor, etc.) to have it set everything up:

```
I want to generate images using ComfyUI. Please help me set up the ComfyUI MCP server.

1. First, add the ComfyUI MCP server to my configuration. The Docker config is:
   - Command: docker
   - Args: run -i --rm --pull always -e COMFYUI_URL=http://host.docker.internal:8000 ghcr.io/shawnrushefsky/comfyui-mcp:latest

2. Once configured, use comfyui_get_status to check if ComfyUI is running and connected.

3. If ComfyUI isn't installed or isn't running, use the official Comfy MCP's
   install_comfyui / launch_comfyui. This server does not manage the process.

4. Use the official Comfy MCP's search_models to see what models I have.

5. Use comfyui_recommend_workflow with one of those model filenames — it names the
   right workflow shape and the settings that model wants.

6. Use comfyui_get_prompting_guide to learn the correct prompting style for my model.

7. Use comfyui_get_user_snippet to build a workflow and comfyui_run_workflow to generate
   a test image.
```

> **Tip**: If you're using the ComfyUI Desktop app, it runs on port 8000. If you installed ComfyUI manually, change the port to 8188. Auto-discovery scans both, so `COMFYUI_URL` is only needed when the port is unusual or ComfyUI is on another host.

---

## What is This?

This is a fork of the original repo owned by Shawn R that adds security
improvements (SSRF-guarded URL fetching, sandboxed workflow writes, size and
extension limits on local file reads) along with response-size discipline and
a companion ComfyUI custom node. This MCP server acts as a bridge between AI
assistants and ComfyUI, the powerful node-based interface for Stable Diffusion
and other generative AI models. It allows Claude and other MCP-compatible AI
assistants to:

- **Run complex workflows** from a graph you hold in memory, with full control
  over every node and parameter — and read a node's **text** output by id
- **Compose custom workflows** by building nodes against the live catalog
- **Create videos** using AnimateDiff, Stable Video Diffusion, Wan, LTX-Video, Mochi, Cosmos and Hunyuan Video
- **Generate audio** using Stable Audio, ACE-Step and other audio models
- **Edit workflow files** without clobbering what you have open in a browser tab
- **Manage your queue** - view, cancel, and interrupt jobs
- **Remember what worked** across sessions, in a local notes database
- **Help you set up** - install ComfyUI, launch it, find model downloads

## Key Features

### Self-Configuring
The server automatically discovers your ComfyUI installation and detects what
models and features are available. No manual configuration of capabilities
required. It reconnects on its own when ComfyUI is restarted or comes back on a
different port — no need to restart the server or your MCP client.

### Works Without ComfyUI Running
Even if ComfyUI isn't installed or running, the server provides tools to:
- Guide you through installation (`comfyui_get_install_guide`, `comfyui_get_model_guide`)
- Look up where to download a model, with a ready-to-run `wget` command (`comfyui_get_download_url`)
- Browse and fetch example workflows from the documentation
- Read prompting guides, search templates, and save notes

Launching ComfyUI is one tool call away (`comfyui_start_comfyui`), and tools
that need a live instance say so and name the tool that fixes it rather than
failing blankly.

### Workflow-First Architecture
All generation happens through `comfyui_run_workflow`, giving you full control over the ComfyUI workflow. The server provides comprehensive tools for:
- **Templates**: Pre-built workflows for common tasks
- **Node composition**: Build custom workflows node by node
- **Validation**: Check workflows before running

### 77 Example Workflows
Library of example workflows from the [official ComfyUI documentation](https://comfyanonymous.github.io/ComfyUI_examples/), split into individually discoverable entries:

| Category | Count | Category | Count |
|---|---|---|---|
| `flux` | 11 | `sd3` | 5 |
| `video` | 10 | `stable_cascade` | 5 |
| `controlnet` | 6 | `hidream` | 4 |
| `inpainting` | 5 | `basics` / `sdxl` / `qwen` / `advanced` | 3 each |
| `unclip` | 3 | `turbo` / `hunyuan` | 2 each |
| `lora`, `hypernetworks`, `embeddings`, `upscale`, `lcm`, `aura_flow`, `chroma`, `lumina`, `edit`, `omnigen`, `audio`, `3d` | 1 each | | |

### 26 Model Architectures, 26 Prompting Guides
Architecture detection, prompting advice, and workflow-shape selection are
driven by one registry, so all of it agrees:

| Family | Architectures |
|---|---|
| Stable Diffusion | `sd15`, `sdxl`, `sd3`, `cascade` |
| Flux and derivatives | `flux`, `chroma` |
| Booru-tag anime | `anima`, `illustrious`, `noobai`, `pony`, `animagine` |
| Other transformers | `qwen`, `hunyuan`, `auraflow`, `kolors`, `pixart`, `playground`, `hidream`, `lumina`, `zimage`, `omnigen` |
| Video | `wan`, `ltxvideo`, `mochi`, `cosmos` |
| Audio | `aceaudio` |

**Every architecture has its own guide**, and a test enforces it in both
directions — no architecture may point at a guide that does not exist, and no
guide may be unreachable. Previously eleven of twenty-one had one and the rest
answered "no dedicated prompting guide yet".

For the booru-tag models, `comfyui_search_tags` and `comfyui_related_tags`
look tags up in the full Danbooru vocabulary rather than the curated list in
the guide — see [Where the tag data comes from](#where-the-tag-data-comes-from).

Architectures are matched most-specific-first, so a Flux-derived model is
identified as itself rather than as Flux — and a booru-tag anime finetune is
identified as itself rather than as the SDXL it is built on. That last point
matters more than it sounds: `illustrious`, `pony` and `noobai` used to be
listed as *aliases of SDXL*, so their users were told to write natural-language
scene descriptions and that quality tags were unnecessary, which is close to
the opposite of what those models want.

### Template System
Three sources of workflow templates:
- **Built-in templates**: Standard txt2img for SD1.5, SDXL, Flux, Qwen and Anima
- **Example workflows**: 77 from official ComfyUI docs
- **Custom templates**: Save and reuse your successful workflows, stored in a local SQLite database

### Workflow Composition Tools
Build custom workflows programmatically:
- **`comfyui_build_node`**: Generate valid node JSON with proper defaults
- **`comfyui_get_node_info`**: Detailed node inputs/outputs with examples
- **`comfyui_find_nodes_by_type`**: Discover nodes by what they accept/produce
- **`comfyui_validate_workflow`**: Check validity before running — including whether each model filename, sampler and input image actually exists on this instance

### Safe Workflow-File Editing
Writing a `.json` workflow with a plain file tool loses work, because the
browser tab holding that workflow keeps a cached copy and — with
`Comfy.Workflow.AutoSave` on — writes it back over yours minutes later.

`comfyui_write_workflow` does `flush → read + diff → write → reload` instead:
it asks any open tab to save first, diffs what was already there against what
you are about to write, writes, then tells the tab to re-read from disk. If
the human had unsaved edits, they show up in the returned diff rather than
disappearing.

This needs the companion [ComfyUI-TabBridge](comfyui-tabbridge/) custom node,
which ships in this repo. See [Optional:
ComfyUI-TabBridge](#optional-comfyui-tabbridge). Without it, writes still work
— they just can't see or steer tabs.

### Responses Sized for a Model
Every listing is paginated, capped, and returns compact JSON by default,
because a tool response is context the reader pays for on every call.
`comfyui_list_nodes` once returned 440KB (~110k tokens) on a modded install.
Single responses are truncated at 25,000 characters with a message naming the
parameter that narrows the request.

---

## Quick Start Guide

### Step 1: Install ComfyUI

**Option A: Desktop App (Recommended for most users)**
1. Go to [comfy.org/download](https://www.comfy.org/download)
2. Download for your platform (macOS, Windows, or Linux)
3. Install and launch the application
4. ComfyUI will automatically set up Python and dependencies

**Option B: Manual Installation**
```bash
# Clone the repository
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Install dependencies (use a virtual environment recommended)
pip install -r requirements.txt

# Run ComfyUI
python main.py
```

### Step 2: Download a Model

You need at least one checkpoint model. Here are popular options:

**SDXL (Recommended - high quality, 1024x1024)**
- Download `sd_xl_base_1.0.safetensors` from [HuggingFace](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)
- Place in `ComfyUI/models/checkpoints/`

**Flux (State of the art quality)**
- Download `flux1-schnell.safetensors` from [HuggingFace](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
- Place in `ComfyUI/models/unet/`
- Also need CLIP encoders from [flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders)

**SD 1.5 (Classic, fast, many LoRAs available)**
- Download `v1-5-pruned-emaonly.safetensors` from [HuggingFace](https://huggingface.co/runwayml/stable-diffusion-v1-5)
- Place in `ComfyUI/models/checkpoints/`

Or ask your assistant: `comfyui_get_download_url` returns the URL, the folder
it belongs in, and a `wget` command for any model it knows about.

### Step 3: Configure Your AI Assistant

Add the ComfyUI MCP server to your AI assistant's configuration.

**Claude Desktop** (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "comfyui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--pull", "always",
        "-e", "COMFYUI_URL=http://host.docker.internal:8000",
        "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
      ]
    }
  }
}
```

> **Note**: The ComfyUI Desktop app uses port 8000. If you're running ComfyUI manually, change the port to 8188.

### Step 4: Start Generating!

1. Make sure ComfyUI is running (http://localhost:8188, or :8000 for the desktop app, should show the UI)
2. Restart Claude Desktop
3. Ask Claude to generate an image:

```
Generate an image of a sunset over mountains using Flux
```

Claude will automatically:
- Connect to your ComfyUI instance
- Search for the right template
- Build and validate a workflow
- Execute and display the result

---

## Installation

### Prerequisites
- [ComfyUI](https://www.comfy.org/download) (desktop app recommended) or manual installation
- One or more checkpoint/model files
- Docker, or Node.js 24+ (Active LTS)

### Option 1: Docker

Works with any MCP-compatible AI assistant, and the image pulls updates
automatically.

> **This fork does not publish a public image.** The `ghcr.io/shawnrushefsky/comfyui-mcp`
> image below is the upstream one and does **not** contain this fork's changes.
> To run this fork, build the image locally (see [Docker Build](#docker-build))
> and use that tag, or install [from source](#option-2-from-source).

#### Claude Desktop

Config file location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "comfyui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--pull", "always",
        "-e", "COMFYUI_URL=http://host.docker.internal:8000",
        "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
      ]
    }
  }
}
```

#### Claude Code (CLI)

Add to `.mcp.json` in your project root:
```json
{
  "mcpServers": {
    "comfyui": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--pull", "always",
        "-e", "COMFYUI_URL=http://host.docker.internal:8000",
        "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
      ]
    }
  }
}
```

Or add globally via CLI:
```bash
claude mcp add comfyui --transport stdio -- docker run -i --rm --pull always -e COMFYUI_URL=http://host.docker.internal:8000 ghcr.io/shawnrushefsky/comfyui-mcp:latest
```

#### Cursor

Add to Cursor's MCP settings (Settings → MCP Servers):
```json
{
  "comfyui": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm", "--pull", "always",
      "-e", "COMFYUI_URL=http://host.docker.internal:8000",
      "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
    ]
  }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "comfyui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--pull", "always",
        "-e", "COMFYUI_URL=http://host.docker.internal:8000",
        "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
      ]
    }
  }
}
```

#### Cline (VS Code Extension)

Add to Cline's MCP settings in VS Code:
```json
{
  "comfyui": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm", "--pull", "always",
      "-e", "COMFYUI_URL=http://host.docker.internal:8000",
      "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
    ]
  }
}
```

#### Linux (Any Client)

On Linux, use `--network=host` instead of `host.docker.internal`:
```json
{
  "mcpServers": {
    "comfyui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--pull", "always",
        "--network=host",
        "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
      ]
    }
  }
}
```

#### Port Configuration

- **ComfyUI Desktop app** (macOS/Windows): Uses port `8000` by default
- **Manual ComfyUI installation**: Uses port `8188` by default

Adjust the `COMFYUI_URL` environment variable accordingly:
- Desktop app: `http://host.docker.internal:8000`
- Manual install: `http://host.docker.internal:8188`

#### Docker Caveats

Two behaviours change inside a container, both deliberate:

- **`comfyui_start_comfyui` refuses to run.** The process to launch is on the
  host, not in the container. Start ComfyUI yourself.
- **Generated images are not written to disk** unless you set `OUTPUT_DIR` and
  mount a volume for it — otherwise the write lands in a container layer
  nobody will ever look at. Images still come back inline as base64.

```json
"args": [
  "run", "-i", "--rm", "--pull", "always",
  "-e", "COMFYUI_URL=http://host.docker.internal:8000",
  "-e", "OUTPUT_DIR=/outputs",
  "-v", "/Users/me/comfy-outputs:/outputs",
  "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
]
```

### Option 2: From Source

```bash
git clone https://github.com/oroboros083-jpg/comfyui-mcp.git
cd comfyui-mcp
npm install
npm run build
```

Then configure your MCP client to use the built server:

**Claude Desktop**:
```json
{
  "mcpServers": {
    "comfyui": {
      "command": "node",
      "args": ["/path/to/comfyui-mcp/dist/index.js"]
    }
  }
}
```

**Claude Code** (`.mcp.json`): the repo ships one, so cloning and building is
enough. It uses a path relative to the repo, since that is where the file
lives:

```json
{
  "mcpServers": {
    "comfyui": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

Claude Desktop needs the absolute path above instead - it has no project
directory to resolve a relative one against.

### Optional: ComfyUI-TabBridge

The [Workflow File Tools](#workflow-file-tools) need a small companion custom
node, which lives in [`comfyui-tabbridge/`](comfyui-tabbridge/) in this repo.
It adds **no nodes** — it serves three routes (`/tabs/state`, `/tabs/flush`,
`/tabs/reload`) that let something outside the browser see and steer ComfyUI's
open workflow tabs.

ComfyUI loads custom nodes from a directory outside this repo, so this is a
post-clone step:

```bash
npm run link:tabbridge     # creates a junction (Windows) or symlink (elsewhere)
npm run link:tabbridge -- --check   # report without changing anything
```

It finds ComfyUI by asking a running instance for its own argv, is safe to
re-run, and refuses to delete a real directory already sitting at the target.
Then restart ComfyUI and confirm with `curl localhost:8000/tabs/state`.

Git stores the directory but never the link — a clone that could create things
outside its own tree would be a code-execution vector — so this step is by
design, not by omission. See [`comfyui-tabbridge/README.md`](comfyui-tabbridge/README.md)
for the manual equivalent and the full rationale.

Everything else in this server works without it.

---

## Tools Reference

### Shared Parameters

Rather than repeat these in every table below, the tools that list or search
accept a common set:

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | `number?` | Max results per page (default: 25, max: 200) |
| `offset` | `number?` | Results to skip, for paging |
| `response_format` | `"json" \| "markdown"?` | Output format (default: `json`) |

Paginated tools return `total`, `count`, `offset`, `has_more` and
`next_offset` alongside the page, so you can page deliberately instead of
guessing. `response_format: "markdown"` renders the same data as readable
text — useful when you are showing tool output to a person; the default
`json` is more compact and is what an assistant should normally use.

A few listing tools also take `detail` (`"names"` / `"summary"` / `"full"`)
to choose how much comes back per item.

Every schema is strict: a misspelled argument is rejected rather than silently
ignored. Any response over 25,000 characters is truncated with a message
naming the parameter that would have narrowed it.

### Setup & Status Tools

#### `comfyui_get_status`
Get the current status of ComfyUI connection and installation. Always probes
ComfyUI live rather than reporting a cached result.

Returns the connection state, the URL in use and how it was discovered, a
capability summary, and prompting advice for the detected primary
architecture. When disconnected it also returns every URL that was tried and
the next step to take. If tasks were left in flight by a restart, it reconciles
and reports them.

```
What's the status of ComfyUI?
```

#### `comfyui_reconnect`
Re-discover ComfyUI and refresh the cached model and node lists. ComfyUI can be
restarted (or moved to a different port) at any time without restarting this
server or your MCP client — tools reconnect on their own — but this forces it
immediately and reports what was found. It also resolves any tasks that were
left in flight by the restart.

This does **not** start ComfyUI. If nothing is running, use
[`comfyui_start_comfyui`](#comfyui_start_comfyui).

```
Reconnect to ComfyUI.
```

### Template & Workflow Library Tools

Everything in this section works with ComfyUI stopped, except
`comfyui_get_user_snippet`, which validates against the nodes actually installed.

#### `comfyui_search_user_snippets`
Search for workflow templates across built-in, example, and custom sources.
Paginated. Results carry only enough to pick one — call
[`comfyui_get_user_snippet`](#comfyui_get_user_snippet) with an id for parameters,
settings and runnable JSON.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelType` | `"sd15" \| "sdxl" \| "sd3" \| "flux" \| "qwen" \| "anima" \| "any"` | Filter by model type (default: `any`) |
| `taskType` | `"txt2img" \| "img2img" \| "inpaint" \| "outpaint" \| "upscale" \| "controlnet" \| "video" \| "audio" \| "any"` | Filter by task type (default: `any`) |
| `category` | `string?` | Filter by category |
| `query` | `string?` | Free text search |
| `includeBuiltIn` | `boolean?` | Include built-in templates (default: true) |
| `includeExamples` | `boolean?` | Include example workflows (default: true) |
| `includeCustom` | `boolean?` | Include saved custom templates (default: true) |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

Returns `{ query, total, count, offset, results, has_more, next_offset }`.

```
Find templates for Flux txt2img
```

#### `comfyui_get_user_snippet`
Build a workflow from a template with your parameters. Returns complete,
runnable JSON for `comfyui_run_workflow`, validated against the nodes this
ComfyUI actually has.

| Parameter | Type | Description |
|-----------|------|-------------|
| `templateId` | `string` | Template ID from `comfyui_search_user_snippets` |
| `parameters` | `object?` | Parameters to apply (prompt, model, etc.) |

```
Get the flux_schnell_txt2img template with prompt "a sunset over mountains"
```

#### `comfyui_save_user_snippet`
Save a workflow as a reusable custom template, stored persistently in the local
database. Name it for its purpose, not its ordering.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Descriptive template name |
| `description` | `string` | What this template does |
| `workflow` | `object` | The workflow JSON |
| `modelType` | `string?` | Model type (sd15, sdxl, flux, etc.) |
| `taskType` | `string?` | Task type (txt2img, img2img, etc.) |
| `category` | `string?` | Category for organization |
| `tags` | `string[]?` | Tags for searching |

```
Save this workflow as "portrait_lighting_studio"
```

#### `comfyui_delete_user_snippet`
Delete a custom saved template. Built-in templates and documentation examples
cannot be deleted and will report so.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Template ID to delete |

#### `comfyui_extract_workflow`
Extract workflow JSON from a ComfyUI-generated PNG image. Also returns any
`Note` nodes found in the graph — often the only explanation of why a workflow
is built the way it is.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | Path to a local PNG, or a URL |

Local files must be `.png` and under 50MB. URLs are fetched through the SSRF
guard (see [Security Notes](#security-notes)). Reports clearly when the image
carries no ComfyUI metadata — which is what happens to a screenshot, or an
image re-encoded by an upload service.

```
Extract the workflow from this image: /path/to/comfyui_output.png
```

#### `comfyui_recommend_workflow`
Get the correct workflow and settings for a model. **Call this before
generating with an unfamiliar model** — checkpoint and UNET models need
structurally different workflows, and using the wrong one fails or produces
noise.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelName` | `string` | Model filename (e.g., 'flux1-schnell-fp8.safetensors') |
| `taskType` | `"txt2img" \| "img2img" \| "inpaint" \| "edit" \| "video"` | Task type (default: `txt2img`) |
| `availableCheckpoints` | `string[]?` | List of available checkpoints |
| `availableUnets` | `string[]?` | List of available UNETs |

Returns:
- Recommended workflow template
- Optimal settings (steps, CFG, sampler, resolution)
- The prompting guide that model expects

```
What workflow should I use for flux1-schnell-fp8.safetensors?
```

#### `comfyui_plan_iteration`
Get a two-stage plan: a cheap draft stage for farming prompts and seeds, then
the final render, each with its own steps/CFG/sampler. Call this before
starting a batch — iterating on a 20-step model while a 4-step draft path sits
installed spends most of a time budget on renders nobody keeps.

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | `string` | The model you intend to render the FINAL image with |
| `seed` | `number?` | Seed echoed in both stages, so the two runs are comparable (default: chosen) |
| `availableCheckpoints` | `string[]?` | Plan against this list instead of asking ComfyUI |
| `availableUnets` | `string[]?` | Plan against this list instead of asking ComfyUI |
| `availableLoras` | `string[]?` | Plan against this list instead of asking ComfyUI |
| + [shared parameters](#shared-parameters) | | `response_format` |

Returns `{ draft?, final, seedCarryOver, note, suggestedDownloads? }`.

**`seedCarryOver` is the field that matters**, because the two draft paths do
not behave the same way:

| Draft path | `seedCarryOver` | What transfers |
|---|---|---|
| Same base model + a distill LoRA (Lightning, Hyper, LCM, DMD2, TCD) | `composition` | Layout, pose and framing largely survive at the same seed. The draft is a real preview, so seed farming pays off. |
| A separate distilled checkpoint (`flux1-schnell` → `flux1-dev`) | `prompt-only` | Different weights, so the same seed renders a **different image**. Only prompt wording and framing intent carry. |
| Nothing fast installed | `none` | Nothing — the response names distill LoRAs to fetch through [`comfyui_get_download_url`](#comfyui_get_download_url). |

The LoRA path wins when both are available, since it is the only one that
previews composition. Works with ComfyUI stopped if you pass the model lists.

```
Plan a cheap iteration loop for flux1-dev.safetensors
```

#### `comfyui_get_prompting_guide`
Get prompting best practices for a model architecture. These differ
substantially — Flux and SD3 want natural language and ignore negative
prompts, SD1.5 wants keyword lists and depends on them, and the booru-tag
anime models want a fixed tag vocabulary in a specific order.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelType` | `string?` | An architecture id, an alias, or a raw model filename. `"all"` (default) returns the index. |
| `detail` | `"overview" \| "full"?` | `overview` (default) or the whole guide. Ignored when `modelType` is `"all"`. |
| `section` | `string?` | Return just one section. Overrides `detail`. |

**Progressive disclosure.** The guides total roughly 70,000 characters — nearly
three times the 25,000-character response cap — so asking for everything used
to return a truncated document. Three levels instead:

| Call | Returns | Size |
|---|---|---|
| `{}` or `modelType: "all"` | An index: every guide in one table, plus how to choose | ~3.5KB |
| `{ modelType: "anima" }` | That guide's overview, ending with the sections it withheld | ~0.9KB |
| `{ modelType: "anima", section: "structure" }` | Just the tag order | ~1.3KB |
| `{ modelType: "illustrious", section: "vocabulary" }` | Just the exact tag list | ~2.4KB |
| `{ modelType: "anima", detail: "full" }` | Everything | ~5KB |

Sections are `overview`, `structure` (the tag order), `syntax` (weighting,
escaping, and which A1111 constructs ComfyUI silently ignores), `tags`
(quality and rating tokens), `vocabulary` (exact Danbooru tags), `tips`,
`mistakes`, `starters` (paste-ready prompts) and `models` (Hugging Face cards).

Two of those are worth calling out:

- **`syntax`** records what CLIPTextEncode actually implements. `(tag:1.2)`
  parses on every model but does nothing on an encoder that ignores attention
  weighting, and `BREAK` / `[a|b]` are A1111 constructs ComfyUI encodes as
  literal text. Both fail silently, so the guide states them rather than
  leaving them to be discovered.
- **`vocabulary`** carries exact Danbooru tags grouped by what they control —
  framing, gaze, expression, lighting and so on. On a booru model an
  unrecognised tag contributes almost nothing, so `cowboy_shot` beats
  "three-quarter length shot", which is not a tag at all.

A model filename resolves through the architecture registry, so
`flux1-schnell-fp8.safetensors` and `waiIllustriousSDXL_v170.safetensors` both
work — the latter now reaching the Illustrious guide rather than the SDXL one.

```
How should I write prompts for Flux?
```

```
What tag order does Anima want?
```

#### `comfyui_search_tags`
Search the Danbooru tag vocabulary by substring, for the booru-tag models
(`illustrious`, `noobai`, `pony`, `animagine`, `anima`). Use it to **check a
tag exists** before putting it in a prompt, and to find the real tag for an
idea — an unrecognised tag contributes almost nothing on these models, so
"looking over her shoulder" is dead weight where `looking_back` works.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Substring to match against tag names and aliases. Underscores and spaces are interchangeable. |
| `category` | `"general" \| "artist" \| "copyright" \| "character" \| "meta" \| "any"?` | Restrict to one Danbooru category (default: `any`) |
| `minCount` | `number?` | Only tags with at least this many posts (default: 0) |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

Results rank exact match, then prefix, then substring, then alias — and within
each by Danbooru post count, which stands in for how well a model knows the
tag. A tag with 400 posts is technically valid and practically inert.

```
Is there a tag for looking over your shoulder?
```

#### `comfyui_related_tags`
Given tags already in a prompt, find tags that commonly appear alongside them
on Danbooru. This is the "what else should be in this prompt" tool.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tags` | `string[]` | Tags already in the prompt (1–20) |
| `category` | `string?` | Restrict suggestions to one category |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

With several inputs, a tag that co-occurs with **all** of them outranks one
that is merely very common beside a single input — otherwise every query
returns `1girl` and `solo`, which you already had.

```
What tags usually go with 1girl, maid, indoors?
```

#### Where the tag data comes from

Both tools prefer [ComfyUI-Autocomplete-Plus](https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus),
a third-party custom node that downloads the Danbooru tag and co-occurrence
CSVs and serves them over ComfyUI's HTTP server. This server fetches them
once, indexes them in memory, and searches server-side.

It is optional. Without it both tools still answer, from the ~150-tag curated
vocabulary built into the prompting guides, and report `source: "builtin"` so
you can tell a small answer from a full one. `comfyui_related_tags` needs the
node's co-occurrence data and says so plainly when it is missing rather than
returning an empty list that would read as "these tags have no relatives".

### Generation Tools

#### `comfyui_run_workflow`
Run a ComfyUI workflow (API format JSON). This is the primary generation tool.
Async by default: returns immediately with a task ID. Use
[`comfyui_get_task`](#comfyui_get_task) for progress and
[`comfyui_get_task_result`](#comfyui_get_task_result) for output.

| Parameter | Type | Description |
|-----------|------|-------------|
| `workflow` | `object` | ComfyUI workflow JSON (API format) |
| `outputMode` | `"base64" \| "file" \| "auto"` | Whether images also come back inline (default: `auto`) — see [Image Output](#image-output) |
| `name` | `string?` | Descriptive name for later retrieval (e.g., "sunset_portrait_v2") |
| `sync` | `boolean?` | Wait for completion (default: `false`, async) |
| `imageFormat` | `"jpeg" \| "png" \| "webp"` | Output format (default: `jpeg`) |
| `imageQuality` | `number?` | Quality 1-100 for JPEG/WebP (default: 85) |
| `collectText` | `string[]?` | Node IDs whose text output to return. Omitted, **no text is returned at all** — see below |

Sync and async are one code path — a sync run is the async run plus a wait — so
the two cannot drift in what they return.

`collectText` is node IDs rather than a boolean on purpose. A graph emits a
great deal of text through the same channel that carries its images — echoed
prompts, seeds, node debug strings, progress logging — and returning all of it
costs context for nothing. Naming the nodes you want is the point; only the
keys `text`, `tags`, `caption` and `string` are read, and values are capped per
node and overall. [`comfyui_describe_image`](#comfyui_describe_image) builds its
own graph and so names its own nodes.

```
Run this workflow: [paste JSON]
```

#### `comfyui_get_image`
Retrieve a generated image from ComfyUI's output directory as an image content
block. Use when you know the filename; `comfyui_get_task_result` returns images
for a task without needing one.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filename` | `string` | Image filename (e.g., 'ComfyUI_00001_.png') |
| `subfolder` | `string?` | Subfolder within the output directory |
| `type` | `"output" \| "input" \| "temp"` | Image location type (default: `output`) |
| `imageFormat` | `"jpeg" \| "png" \| "webp"` | Output format (default: `jpeg`) |
| `imageQuality` | `number?` | Quality 1-100 for JPEG/WebP (default: 85) |

```
Get the image named ComfyUI_00042_.png
```

#### `comfyui_upload_image`
Put an image into ComfyUI's input directory so a `LoadImage` node can read it. Required before any
img2img, inpainting, ControlNet or image-to-video workflow: `LoadImage` reads only from that
directory, so a file on your disk - or the image the last run produced - is unreachable until it is
uploaded.

Pass exactly one source.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string?` | Absolute path to an image file on the machine running this server |
| `from_output` | `object?` | An image ComfyUI already has: `{ filename, subfolder?, type? }` |
| `filename` | `string?` | Name to store it under (default: the source filename) |
| `subfolder` | `string?` | Subfolder within the input directory |
| `overwrite` | `boolean?` | Replace a file of the same name (default: false) |

Returns:
- `reference`: The exact string to put in a `LoadImage` node's `image` input
- `filename`, `subfolder`, `type`: Where ComfyUI actually stored it
- `width`, `height`, `format`, `sizeBytes`: The uploaded image, for sizing the latent or a resize node

With `overwrite` false a colliding name is stored as `photo (1).png`, so build the workflow from the
returned `reference` rather than the name you asked for. Errors if the path is unreadable, the file
is not a raster image, or it exceeds 64MB. SVG markup goes through
[`comfyui_render_svg`](#comfyui_render_svg) instead, which rasterizes and uploads in one step.

```
Upload ~/photos/portrait.jpg and use it as the ControlNet reference
```

```
Take the image that last run produced and feed it back in for an upscale pass
```

### Workflow File Tools

These read and write ComfyUI's saved `.json` workflow files while cooperating
with the browser tabs that have them open. They need the
[ComfyUI-TabBridge](#optional-comfyui-tabbridge) custom node; without it they
report `available: false` with a hint naming the setup step, and
`comfyui_write_workflow` still writes — it just can't flush or reload tabs.

Paths are relative to ComfyUI's user directory (e.g.
`workflows/Shared/pipeline.json`). Writes outside it require the directory to
be listed in `workflowWriteDirs` in the config file, which is edited by hand:
there is deliberately no tool for granting that, because a permission an agent
can grant itself is not a permission.

#### `comfyui_describe_image`
Run an image through an installed tagger or captioner and get back what it says
is in it. Use this on a reference image **before** writing a prompt from it: it
answers in the vocabulary the diffusion model was trained on, which your own
description of the image is not. A booru model does not know "glancing over her
shoulder"; it knows `looking_back`.

Pass exactly one image source.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string?` | Absolute path to an image on the machine running this server |
| `from_output` | `object?` | An image ComfyUI already has: `{ filename, subfolder?, type? }` |
| `reference` | `string?` | An image already in the input directory, as [`comfyui_upload_image`](#comfyui_upload_image) reported it |
| `backends` | `string[]?` | Backend ids to run. Omitted, one is chosen from `promptingStyle` |
| `promptingStyle` | `"booru_tags" \| "natural_language" \| "keywords" \| "hybrid"` | The style of the model you will generate with, from [`comfyui_get_prompting_guide`](#comfyui_get_prompting_guide) |
| `prompt` | `string?` | A steer for the backends that take one (a question for Florence-2, an extra instruction for JoyCaption) |
| + [shared parameters](#shared-parameters) | | `response_format` |

Returns `{ reference, descriptions: [{ backend, kind, nodeType, values }], hint }`.

Pass several ids to run a tagger **and** a captioner in one call —
`backends: ["wd14", "florence2"]` — and each answer stays labelled by backend
rather than merged into one blob.

| Backend | Kind | Node type(s) | Install |
|---|---|---|---|
| `wd14` | tags | `WD14Tagger\|pysssss` | [ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger) |
| `florence2` | prose | `Florence2Run` | [ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2) |
| `joycaption` | prose | `JJC_JoyCaption` and the other forks' names | [joycaption_comfyui](https://github.com/fpgaminer/joycaption_comfyui) |

Each backend lists several candidate node types and takes the first one your
instance actually offers — JoyCaption in particular has several competing
wrappers, so pinning one name would pick a winner you may not have installed.

`wd14` is an OUTPUT_NODE and terminates its own graph. The two captioners
return a plain string, so they also need a text preview node to surface it at
all; ComfyUI's built-in `PreviewAny` is enough, and a backend without one is
reported as unavailable rather than run to produce nothing. With no backend
installed the tool errors naming the repos, rather than returning an empty
description that reads as "there is nothing in this image".

```
Describe ~/refs/pose.jpg as tags I can use with an Illustrious model
```

#### `comfyui_list_open_workflows`
List the workflows currently open in the user's ComfyUI browser tabs, and which
have **unsaved** changes. Takes no parameters. Call before rewriting a workflow
file.

```
What workflows do I have open right now?
```

#### `comfyui_read_workflow`
Read a workflow file as JSON. Reads through ComfyUI so it always sees the
current file rather than a cached copy. Returns `{ found: false, path }` when
the file does not exist.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Workflow path relative to the user directory, or an absolute path inside a granted directory |

#### `comfyui_write_workflow`
Write a workflow file **safely**: flushes any open tab so unsaved human edits
reach disk, diffs the existing file against what you are about to write,
writes, then tells the tab to reload. Always use this instead of writing
workflow JSON with a generic file tool.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Workflow path relative to the user directory, or an absolute path inside a granted directory |
| `workflow` | `object` | The full workflow JSON (UI format, with nodes and links) |
| `skip_flush` | `boolean?` | Skip asking open tabs to save first. Leave this alone. |
| `skip_reload` | `boolean?` | Skip telling open tabs to re-read afterwards. Leave this alone. |

Returns `{ written, path, flushed, reloaded, human_edits_detected }`, plus
`their_changes` and `action_required` when the diff is non-empty. A non-empty
diff means the human had edited that workflow — read it and fold their intent
into what you generate, rather than regenerating it away.

```
Rewrite workflows/Shared/pipeline.json with the updated graph
```

### Workflow Composition Tools

#### `comfyui_build_node`
Generate valid node JSON with proper defaults. Includes tips for certain nodes (e.g., SaveImage filename guidance).

| Parameter | Type | Description |
|-----------|------|-------------|
| `nodeType` | `string` | Node class_type (e.g., "KSampler") |
| `nodeId` | `string` | ID for this node in the workflow |
| `inputs` | `object?` | Input values to set |

Returns:
- `node`: The node JSON to add to your workflow
- `outputs`: Output references for connecting to other nodes
- `missingConnections`: Inputs that need to be connected
- `tips`: Best practices for this node type

```
Build a SaveImage node with ID "9"
```

### Discovery Tools

### Task & Queue Management

"Tasks" are this server's own tracking of runs it submitted; "jobs" are what
ComfyUI has queued, including work submitted from the browser or another
client.

#### `comfyui_get_task`
Get the status of an async generation task: current step, total steps, average
step time, estimated remaining time, and a suggested poll interval derived from
the actual generation speed.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID returned by `comfyui_run_workflow` |

#### `comfyui_get_task_result`
Get the result of a completed generation task, returning its images. If the
task is still running, it says so rather than blocking.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID |

#### `comfyui_list_tasks`
List generation tasks tracked by this server, newest first, with a count by
status. Works with ComfyUI stopped.

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `"working" \| "completed" \| "failed" \| "cancelled"?` | Only return tasks in this state |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

Returns `{ summary: {<status>: count}, total, count, offset, tasks, has_more, next_offset }`.

#### `comfyui_cancel_task`
Cancel an async generation task. For a task still queued in ComfyUI this
cancels the underlying job; for one already generating, use
[`comfyui_interrupt`](#comfyui_interrupt).

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID to cancel |

#### `comfyui_get_queue`
Get ComfyUI's current queue status — what is running now and what is pending.
Reflects everything queued on the instance, including work submitted outside
this server. Paginated, running jobs first.

| Parameter | Type | Description |
|-----------|------|-------------|
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

Returns `{ total, count, offset, running, pending, jobs: [{ position, promptId, state }], has_more, next_offset }`,
where `running`/`pending` count the whole queue and `jobs` is this page of it.

```
What's in the generation queue?
```

#### `comfyui_cancel_job`
Cancel a **queued** ComfyUI job by prompt ID. Only works for jobs that have not
started — to stop a job that is actively generating, use
[`comfyui_interrupt`](#comfyui_interrupt).

| Parameter | Type | Description |
|-----------|------|-------------|
| `promptId` | `string?` | Prompt ID of the queued job. Omit to clear the entire queue. |

```
Cancel the current job
```

#### `comfyui_interrupt`
Interrupt the job ComfyUI is currently running, discarding its output. Takes no
parameters. For jobs queued but not yet started, use
[`comfyui_cancel_job`](#comfyui_cancel_job).

```
Stop the current generation
```

#### `comfyui_get_history`
Get generation history. Without `promptId` this lists prompts and is
paginated; with `promptId` it returns that one prompt's output files.

| Parameter | Type | Description |
|-----------|------|-------------|
| `promptId` | `string?` | Fetch one prompt's full detail instead of a listing |
| `order` | `"newest" \| "oldest"` | Which end of the history to page from (default: `newest`) |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

Listing returns `{ total, count, offset, entries: [{ promptId, status, completed, hasOutputs }], has_more, next_offset }`.
Detail returns `{ promptId, status, completed, outputs }`, or a not-found
message naming the id.

```
Show recent generations
```

### Agent Memory Tools

These tools help AI agents remember learnings across sessions. Notes live in a
local SQLite database (`~/.comfyui-mcp/data.db` by default) and work with
ComfyUI stopped.

#### `comfyui_save_note`
Save a note about something learned during image generation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `topic` | `string` | Topic/category (e.g., "flux-models", "prompting-tips") |
| `content` | `string` | The note content |
| `tags` | `string[]?` | Optional tags for searching |

```
Remember that Flux works best with natural language prompts
```

#### `comfyui_get_notes`
Retrieve saved notes, newest first, optionally filtered by topic. Paginated in
SQL, so `total` is the real count rather than a cap.

| Parameter | Type | Description |
|-----------|------|-------------|
| `topic` | `string?` | Only return notes under this topic |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

#### `comfyui_search_notes`
Full-text search across note topics, content and tags. Paginated.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Search terms |
| + [shared parameters](#shared-parameters) | | `limit`, `offset`, `response_format` |

#### `comfyui_delete_note`
Delete a note by its numeric ID, as returned by `comfyui_get_notes`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `number` | The note ID to delete |

#### `comfyui_list_topics`
List every topic that has notes, with a count for each. Takes no parameters.

```
What topics have I saved notes about?
```

### User Preferences Tools

#### `comfyui_get_user_preferences`
Get user habits derived from analysing the workflow metadata embedded in their
existing ComfyUI output: the workflows they actually use (as runnable
templates), the models they favour, and their usual settings. Use to match
their established style instead of guessing.

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeWorkflows` | `boolean?` | Include workflow templates (default: true) |
| `includeModels` | `boolean?` | Include model usage stats (default: true) |
| `includeSettings` | `boolean?` | Include common settings (default: true) |
| `includeWorkflowJson` | `boolean?` | Include each template's full workflow JSON (default: **false**) |
| `workflowLimit` | `number?` | Max workflow templates, 1–50 (default: 10) |
| `modelLimit` | `number?` | Max models, 1–100 (default: 20) |

Full workflow JSON is large, so it is off by default. Pick a template by hash
from the summaries, then call again with `includeWorkflowJson: true` and
`workflowLimit: 1`.

If no output history has been analysed, it returns `available: false` with the
reason and the next step, rather than an empty success.

```
What workflows and models do I use most often?
```

### SVG & Font Tools

These tools allow creating precise base images — layouts, masks, text, diagrams
— for img2img and ControlNet workflows.

#### `comfyui_render_svg`
Render SVG content to PNG and upload it into ComfyUI's input folder. Returns
the filename to use in a `LoadImage` node.

| Parameter | Type | Description |
|-----------|------|-------------|
| `svg` | `string` | SVG content (full markup including `<svg>` tags) |
| `filename` | `string?` | Output filename without extension (default: `svg_render_<timestamp>`) |
| `width` | `number?` | Output width in pixels (default: 768) |
| `height` | `number?` | Output height in pixels (default: 768) |
| `background` | `string?` | Background color, hex like `#ffffff` or `transparent` (default: transparent) |
| `fonts` | `array?` | Fonts to embed, each `{ name, family? }` — download them first |

```
Render this map SVG as a base for img2img
```

#### `comfyui_download_font`
Download a font from Google Fonts or a direct URL for use in SVG rendering.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `object` | Font source (see below) |

**Google Fonts source:**
```json
{ "type": "google", "family": "Cinzel", "weight": 400 }
```

**URL source:** (must point at a `.ttf`, `.otf` or `.woff2`)
```json
{ "type": "url", "url": "https://...", "name": "MyFont" }
```

Popular fantasy/map fonts available on Google Fonts: Cinzel, Pirata One, MedievalSharp, UnifrakturMaguntia, Almendra.

#### `comfyui_list_fonts`
List all downloaded fonts available for use in SVG rendering. Takes no parameters.

```
What fonts do I have available for SVG rendering?
```

---

## Resources and Prompts

Besides tools, the server exposes MCP **resources** and **prompts** for clients
that support them.

**Resources** (`comfyui://…`) — browsable and readable:

| URI | Contents |
|-----|----------|
| `comfyui://guides/prompting/all` | The complete prompting guide |
| `comfyui://guides/prompting/<architecture>` | One architecture's guide, for each of the 26 |
| `comfyui://examples/<slug>` | One documentation example workflow, one entry per example that has a source image |
| `comfyui://models/checkpoints` | Installed checkpoints |
| `comfyui://models/loras` | Installed LoRAs |
| `comfyui://models/all` | All installed models by type |
| `comfyui://capabilities` | Detected capabilities of the connected instance |

The model and capability resources are enumerated from live ComfyUI state, so
they appear only when connected. Resource bodies are capped the same way tool
responses are, with a message naming the tool to use instead when the body is
too large to read whole.

**Prompts** — parameterized starting points:

| Prompt | Arguments |
|--------|-----------|
| `generate-image` | `prompt`, `model_type`, `aspect_ratio` |
| `setup-comfyui` | `platform`, `model_type` |
| `run-example` | `example_name` |
| `learn-prompting` | `model_type` |

---

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `COMFYUI_URL` | ComfyUI URL. Takes priority over the config file and skips port scanning. |
| `COMFYUI_API_KEY` | API key sent to ComfyUI, for instances that require authentication. Overrides the config file. |
| `COMFYUI_LAUNCH_COMMAND` | Executable or script `comfyui_start_comfyui` should launch, when auto-detection can't find your install |
| `COMFYUI_LAUNCH_ARGS` | Arguments for that command |
| `COMFYUI_LAUNCH_CWD` | Working directory for that command |
| `COMFYUI_MCP_DB_PATH` | Path to the notes/templates SQLite file (default: `~/.comfyui-mcp/data.db`) |
| `OUTPUT_DIR` | Where generated images are written. In Docker, setting this is also what re-enables file saving. |
| `DOCKER` | Set to `true` to force the in-container behaviour when `/.dockerenv` isn't present |

### Config File

Location:
- **macOS**: `~/Library/Application Support/comfyui-mcp/config.json`
- **Windows**: `%APPDATA%/comfyui-mcp/config.json`
- **Linux**: `~/.config/comfyui-mcp/config.json`

```json
{
  "comfyui": {
    "url": "http://127.0.0.1:8188",
    "apiKey": null
  },
  "outputDir": "./outputs",
  "workflowsDir": "./workflows",
  "outputSizeThreshold": 1048576,
  "workflowWriteDirs": []
}
```

Environment variables override the file. The default URL uses `127.0.0.1`
rather than `localhost` because Node 18's `fetch` resolves `localhost` to IPv6
first, which ComfyUI usually isn't listening on.

`workflowWriteDirs` lists extra directories
[`comfyui_write_workflow`](#comfyui_write_workflow) may write to. It is empty
by default — writes normally go through ComfyUI's own userdata API, which
refuses traversal itself. There is deliberately **no tool** that appends to
this list; it is edited by hand.

---

## How It Works

### Auto-Discovery

The server discovers ComfyUI in this order:
1. `COMFYUI_URL` environment variable
2. Config file URL
3. ComfyUI Desktop app configuration files
4. Port scanning on localhost: `8188`, `8000`, `8189`, `8190` (the desktop app commonly uses 8000)
5. If running in Docker, `host.docker.internal` on those same ports

Discovery is re-run automatically when a tool finds the connection dead, so a
ComfyUI that restarts — or comes back on a different port — is picked up
without restarting this server or your MCP client.

### Capability Detection

On connection, the server queries ComfyUI's `/object_info` endpoint to detect:

- **Model Architectures**: all 26 in the registry, matched most-specific-first
  against installed checkpoints and UNETs
- **Extensions**: LoRA, ControlNet, IP-Adapter, AnimateDiff, etc. (based on available nodes)
- **Features**: Video generation, audio generation, upscaling, inpainting
- **Samplers & Schedulers**: Reads available options from the KSampler node

It also analyses the workflow metadata in your existing output folder to learn
which workflows, models and settings you actually use — surfaced by
[`comfyui_get_user_preferences`](#comfyui_get_user_preferences).

### Workflow Execution

When you call `comfyui_run_workflow`, the server:
1. Submits the prompt to ComfyUI's `/prompt` endpoint
2. Creates a tracked task and follows execution over the WebSocket for step-by-step progress
3. Returns the task ID immediately (or waits, if `sync: true`)
4. Collects the output images when execution finishes

Sync and async share one implementation, so `comfyui_get_task_result` and a
`sync: true` run return the same thing.

**Graph shapes.** `comfyui_get_user_snippet` builds one of three shapes, chosen by
the architecture registry rather than by the model's name:

| Shape | Loaders | Used by |
|---|---|---|
| `standard` | CheckpointLoaderSimple | SD1.5, SDXL and its anime finetunes, SD3, Cascade |
| `flux` | UNETLoader + **Dual**CLIPLoader + VAELoader | Flux and the models that genuinely take two text encoders |
| `unet_clip` | UNETLoader + **one** CLIPLoader + VAELoader | Anima, Qwen-Image |

The third exists because "loads a bare UNET" and "needs two text encoders" are
separate facts. Squashing them meant Anima and Qwen-Image — which each load a
single encoder — were built a DualCLIPLoader graph naming a second encoder
they do not use. `unet_clip` also wires the negative prompt to its own
encoder and passes CFG straight through, where the Flux shape ties the
negative to the positive and pins CFG to 1.

### Image Output

Generated images are **always written to disk**, and the absolute path is
returned. `outputMode` controls only whether the bytes also travel inline:

| `outputMode` | Behaviour |
|---|---|
| `auto` (default) | Path, plus inline base64 if the image is under `outputSizeThreshold` (1MB) |
| `base64` | Path plus inline base64, whatever the size |
| `file` | Path only |

Filenames are readable and collision-free — the write picks the first free name
atomically, so two runs landing in the same second can't overwrite each other.

The one exception is Docker: file saving is skipped there unless `OUTPUT_DIR`
is set, because otherwise the write lands in a container layer nobody will look
at. See [Docker Caveats](#docker-caveats).

---

## Security Notes

This fork tightens a few things that are worth knowing about if you are
extending it:

- **URL fetching is SSRF-guarded.** Tools that accept a URL
  (`comfyui_extract_workflow`, `comfyui_download_font`) resolve it first and
  refuse loopback, RFC1918 private space, CGNAT, and link-local addresses —
  including `169.254.169.254`, the cloud metadata endpoint. Redirects are
  re-checked, up to five hops. Calls to ComfyUI itself deliberately bypass this
  guard, since ComfyUI is the trusted, usually-loopback target.
- **Local file reads are bounded.** `comfyui_extract_workflow` accepts only
  `.png` files under 50MB; `comfyui_upload_image` only raster images under
  64MB.
- **Workflow writes are sandboxed** to ComfyUI's user directory plus whatever
  is explicitly listed in `workflowWriteDirs`, and no tool can extend that list.
- **Only one module spawns processes** (`comfyui_start_comfyui`), it refuses to
  run in Docker or against a remote `COMFYUI_URL`, and what it starts is
  detached with stdio discarded.
- **All schemas are strict**, so an unexpected argument is an error rather than
  something silently dropped.

---

## Example Conversations

### First-Time Setup
```
User: I want to use ComfyUI but I don't have it installed
Claude: [comfyui_get_install_guide] Here's how to install ComfyUI...
Claude: [comfyui_get_model_guide] Here's how to download and set up models...
Claude: [comfyui_start_comfyui] Launched it and connected.
```

### Generate Images with Templates
```
User: Generate a pirate husky with Flux
Claude: [comfyui_list_models] Found flux1-schnell-fp8.safetensors...
Claude: [comfyui_recommend_workflow] It's a UNET model — needs the Flux graph, 4 steps, CFG 1.0...
Claude: [comfyui_get_prompting_guide('flux')] Flux uses natural language prompts...
Claude: [comfyui_get_user_snippet with parameters] Built workflow...
Claude: [comfyui_validate_workflow] Workflow is valid...
Claude: [comfyui_run_workflow] Started — task abc123
Claude: [comfyui_get_task_result] Done!
[Image displayed]
```

### Custom Workflow Composition
```
User: I want to build a custom workflow with ControlNet
Claude: [comfyui_list_nodes(search="controlnet")] Here are the ControlNet nodes...
Claude: [comfyui_get_node_info("ControlNetApply")] Here's how to use it...
Claude: [comfyui_upload_image] Put your reference image where LoadImage can read it...
Claude: [comfyui_build_node] Building each node...
Claude: [comfyui_validate_workflow] Checking the workflow...
Claude: [comfyui_run_workflow] Running your custom workflow...
```

---

## Development

### Building

```bash
npm install
npm run build
```

### Running Locally

```bash
npm start
```

### Testing

```bash
npm test          # builds, then runs the unit suite
```

Unit tests use Node's built-in runner (`node:test`) — no test framework
dependency. They live beside the code as `*.test.ts` and run from `dist/` after
compilation, which is why `npm test` builds first. Anything that needs a live
ComfyUI is not a unit test; verify those against a running instance.

### Evals

Unit tests answer "does this function behave". The suites in [`evals/`](evals/)
answer "can a model actually get the job done with these tools", which is what
an MCP server is judged on.

| Suite | Needs ComfyUI? |
|---|---|
| `evals/library.xml` | No — answers come from data compiled into the server. Safe for CI. |
| `evals/live-instance.xml` | Yes — answers depend on which models are installed. |

See [`evals/README.md`](evals/README.md).

### Docker Build

```bash
docker build -t comfyui-mcp .
docker run -i --network=host comfyui-mcp
```

Use that local tag in your MCP client config to run this fork's code rather
than the upstream published image.

### Testing with MCP Inspector

```bash
npm run inspector
```

---

## Troubleshooting

### ComfyUI not detected
1. Make sure ComfyUI is running — or just call `comfyui_start_comfyui`
2. Check it's reachable at http://localhost:8188 (or :8000 for the desktop app)
3. Set `COMFYUI_URL` if it's on an unusual port or another host
4. `comfyui_get_status` lists every URL it tried when it can't connect

### Models not found
1. Ensure models are in the correct ComfyUI subdirectory
2. Restart ComfyUI after adding new models — `comfyui_restart_comfyui` does this cleanly if you have ComfyUI-Manager
3. Use `comfyui_reconnect` to refresh this server's cached model list
4. Use `comfyui_list_models` to see what's detected

### Generation fails
1. Use `comfyui_validate_workflow` — it catches missing model filenames and bad samplers before the run, not after
2. Check `comfyui_get_task` or `comfyui_get_history` for the error
3. Verify the model exists with `comfyui_list_models`
4. Check `comfyui_recommend_workflow` — a checkpoint model in a UNET graph produces noise rather than an error
5. Try simpler parameters (smaller size, fewer steps)

### Workflow edits keep reverting
That's ComfyUI's `Comfy.Workflow.AutoSave` writing a stale tab back over your
file. Install [ComfyUI-TabBridge](#optional-comfyui-tabbridge) and use
`comfyui_write_workflow` instead of a generic file tool.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

MIT

---

## Acknowledgments

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by comfyanonymous
- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- Upstream [comfyui-mcp](https://github.com/shawnrushefsky/comfyui-mcp) by Shawn Rushefsky
