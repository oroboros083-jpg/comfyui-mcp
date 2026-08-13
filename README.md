# ComfyUI MCP Server

- [ComfyUI MCP Server](#comfyui-mcp-server)
  - [Let Your AI Install This For You](#let-your-ai-install-this-for-you)
  - [What is This?](#what-is-this)
  - [Key Features](#key-features)
    - [Self-Configuring](#self-configuring)
    - [Works Without ComfyUI Running](#works-without-comfyui-running)
    - [Workflow-First Architecture](#workflow-first-architecture)
    - [70+ Example Workflows](#70-example-workflows)
    - [Template System](#template-system)
    - [Workflow Composition Tools](#workflow-composition-tools)
  - [Quick Start Guide](#quick-start-guide)
    - [Step 1: Install ComfyUI](#step-1-install-comfyui)
    - [Step 2: Download a Model](#step-2-download-a-model)
    - [Step 3: Configure Your AI Assistant](#step-3-configure-your-ai-assistant)
    - [Step 4: Start Generating!](#step-4-start-generating)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Option 1: Docker (Recommended)](#option-1-docker-recommended)
      - [Claude Desktop](#claude-desktop)
      - [Claude Code (CLI)](#claude-code-cli)
      - [Cursor](#cursor)
      - [Windsurf](#windsurf)
      - [Cline (VS Code Extension)](#cline-vs-code-extension)
      - [Linux (Any Client)](#linux-any-client)
      - [Port Configuration](#port-configuration)
    - [Option 2: From Source](#option-2-from-source)
  - [Tools Reference](#tools-reference)
    - [Setup \& Status Tools](#setup--status-tools)
      - [`get_status`](#get_status)
      - [`reconnect`](#reconnect)
      - [`get_install_guide`](#get_install_guide)
      - [`get_model_guide`](#get_model_guide)
    - [Template \& Workflow Tools](#template--workflow-tools)
      - [`search_templates`](#search_templates)
      - [`get_template`](#get_template)
      - [`save_template`](#save_template)
      - [`delete_template`](#delete_template)
      - [`list_examples`](#list_examples)
      - [`get_example_workflow`](#get_example_workflow)
      - [`extract_workflow`](#extract_workflow)
      - [`recommend_workflow`](#recommend_workflow)
      - [`get_download_url`](#get_download_url)
    - [Prompting Guide Tools](#prompting-guide-tools)
      - [`get_prompting_guide`](#get_prompting_guide)
    - [Generation Tools](#generation-tools)
      - [`run_workflow`](#run_workflow)
      - [`validate_workflow`](#validate_workflow)
      - [`get_image`](#get_image)
    - [Workflow Composition Tools](#workflow-composition-tools-1)
      - [`build_node`](#build_node)
      - [`get_node_info`](#get_node_info)
      - [`find_nodes_by_type`](#find_nodes_by_type)
      - [`list_nodes`](#list_nodes)
    - [Discovery Tools](#discovery-tools)
      - [`get_capabilities`](#get_capabilities)
      - [`list_models`](#list_models)
    - [Task \& Queue Management](#task--queue-management)
      - [`get_task`](#get_task)
      - [`get_task_result`](#get_task_result)
      - [`list_tasks`](#list_tasks)
      - [`cancel_task`](#cancel_task)
      - [`name_generation`](#name_generation)
      - [`get_generation_by_name`](#get_generation_by_name)
      - [`get_queue`](#get_queue)
      - [`cancel_job`](#cancel_job)
      - [`interrupt`](#interrupt)
      - [`get_history`](#get_history)
    - [Agent Memory Tools](#agent-memory-tools)
      - [`save_note`](#save_note)
      - [`get_notes`](#get_notes)
      - [`search_notes`](#search_notes)
      - [`delete_note`](#delete_note)
      - [`list_topics`](#list_topics)
    - [User Preferences Tools](#user-preferences-tools)
      - [`get_user_preferences`](#get_user_preferences)
    - [SVG & Font Tools](#svg--font-tools)
      - [`render_svg`](#render_svg)
      - [`download_font`](#download_font)
      - [`list_fonts`](#list_fonts)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
    - [Config File](#config-file)
  - [How It Works](#how-it-works)
    - [Auto-Discovery](#auto-discovery)
    - [Capability Detection](#capability-detection)
    - [Workflow Execution](#workflow-execution)
  - [Example Conversations](#example-conversations)
    - [First-Time Setup](#first-time-setup)
    - [Generate Images with Templates](#generate-images-with-templates)
    - [Custom Workflow Composition](#custom-workflow-composition)
  - [Development](#development)
    - [Building](#building)
    - [Running Locally](#running-locally)
    - [Docker Build](#docker-build)
    - [Testing with MCP Inspector](#testing-with-mcp-inspector)
  - [Troubleshooting](#troubleshooting)
    - [ComfyUI not detected](#comfyui-not-detected)
    - [Models not found](#models-not-found)
    - [Generation fails](#generation-fails)
  - [Contributing](#contributing)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)


[![Build and Publish](https://github.com/shawnrushefsky/comfyui-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/shawnrushefsky/comfyui-mcp/actions/workflows/publish.yml)

An MCP (Model Context Protocol) server that enables AI assistants like Claude to interact with [ComfyUI](https://github.com/comfyanonymous/ComfyUI) for generating images, audio, video, and more.

---

## Let Your AI Install This For You

Copy and paste this prompt to your AI assistant (Claude, Cursor, etc.) to have it set everything up:

```
I want to generate images using ComfyUI. Please help me set up the ComfyUI MCP server.

1. First, add the ComfyUI MCP server to my configuration. The Docker config is:
   - Command: docker
   - Args: run -i --rm --pull always -e COMFYUI_URL=http://host.docker.internal:8000 ghcr.io/shawnrushefsky/comfyui-mcp:latest

2. Once configured, use get_status to check if ComfyUI is running and connected.

3. If ComfyUI isn't installed, use get_install_guide to help me install it.

4. Use list_models to see what models I have available.

5. Use search_templates to find the right workflow for my model.

6. Use get_prompting_guide to learn the correct prompting style for my model.

7. Use get_template to build a workflow and run_workflow to generate a test image.
```

> **Tip**: If you're using the ComfyUI Desktop app, it runs on port 8000. If you installed ComfyUI manually, change the port to 8188.

---

## What is This?

This is a fork of the original repo owned by Shawn R that implements a few security improvements. This MCP server acts as a bridge between AI assistants and ComfyUI, the powerful node-based interface for Stable Diffusion and other generative AI models. It allows Claude and other MCP-compatible AI assistants to:

- **Run complex workflows** with full control over every node and parameter
- **Compose custom workflows** using node discovery and building tools
- **Create videos** using AnimateDiff, Stable Video Diffusion, and other video models
- **Generate audio** using Stable Audio and other audio models
- **Manage your queue** - view, cancel, and interrupt jobs
- **Help you set up** - download models, install ComfyUI, and configure everything

## Key Features

### Self-Configuring
The server automatically discovers your ComfyUI installation and detects what models and features are available. No manual configuration of capabilities required.

### Works Without ComfyUI Running
Even if ComfyUI isn't installed or running, the server provides tools to:
- Guide you through installation
- Download models directly
- Fetch example workflows from documentation

### Workflow-First Architecture
All generation happens through `run_workflow`, giving you full control over the ComfyUI workflow. The server provides comprehensive tools for:
- **Templates**: Pre-built workflows for common tasks
- **Node composition**: Build custom workflows node by node
- **Validation**: Check workflows before running

### 70+ Example Workflows
Comprehensive library of example workflows from the [official ComfyUI documentation](https://comfyanonymous.github.io/ComfyUI_examples/), split into easily discoverable entries:
- **Flux**: Dev, Schnell, Checkpoint variants, Kontext, Fill, Redux, Canny, Depth, ControlNet
- **SDXL**: Base, Refiner, ReVision (image-guided)
- **SD3.5**: Separate encoders, Checkpoint, Medium, Turbo, ControlNet
- **ControlNet**: Scribble, Depth, T2I-Adapter, Pose, Multiple combined
- **Inpainting/Outpainting**: Basic, dedicated models, various techniques
- **Video**: SVD, Mochi, LTX-Video, Hunyuan Video, Cosmos, Wan
- **And more**: Stable Cascade, HiDream, Qwen Image, Audio generation

### Template System
Three sources of workflow templates:
- **Built-in templates**: Standard txt2img for SD1.5, SDXL, and Flux
- **Example workflows**: 70+ from official ComfyUI docs
- **Custom templates**: Save and reuse your successful workflows

### Workflow Composition Tools
Build custom workflows programmatically:
- **`build_node`**: Generate valid node JSON with proper defaults
- **`get_node_info`**: Detailed node inputs/outputs with examples
- **`find_nodes_by_type`**: Discover nodes by what they accept/produce
- **`validate_workflow`**: Check validity before running

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

1. Make sure ComfyUI is running (http://localhost:8188 should show the UI)
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
- Docker (recommended) or Node.js 18+

### Option 1: Docker (Recommended)

Works with any MCP-compatible AI assistant. The Docker image automatically pulls updates.

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

### Option 2: From Source

```bash
git clone https://github.com/shawnrushefsky/comfyui-mcp.git
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

**Claude Code** (`.mcp.json`):
```json
{
  "mcpServers": {
    "comfyui": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/comfyui-mcp/dist/index.js"]
    }
  }
}
```

---

## Tools Reference

### Setup & Status Tools

#### `get_status`
Get the current status of ComfyUI connection and installation. Always probes ComfyUI live rather than reporting a cached result.

```
What's the status of ComfyUI?
```

#### `reconnect`
Re-discover ComfyUI and refresh the cached model and node lists. ComfyUI can be
restarted (or moved to a different port) at any time without restarting this
server or your MCP client — tools reconnect on their own — but this forces it
immediately and reports what was found. It also resolves any tasks that were
left in flight by the restart.

```
Reconnect to ComfyUI.
```

#### `get_install_guide`
Get platform-specific installation instructions. Recommends the desktop app for most users.

| Parameter | Type | Description |
|-----------|------|-------------|
| `platform` | `"auto" \| "macos" \| "windows" \| "linux"` | Target platform |

```
How do I install ComfyUI on my Mac?
```

#### `get_model_guide`
Get detailed guidance on downloading and installing models.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelType` | `"all" \| "checkpoint" \| "flux" \| "sdxl" \| "sd15" \| "lora" \| "controlnet" \| "vae"` | Type of model |

```
How do I set up Flux models?
```

### Template & Workflow Tools

#### `search_templates`
Search for workflow templates across built-in, example, and custom sources.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelType` | `"sd15" \| "sdxl" \| "sd3" \| "flux" \| "any"` | Filter by model type |
| `taskType` | `"txt2img" \| "img2img" \| "inpaint" \| ...` | Filter by task type |
| `category` | `string?` | Filter by category |
| `query` | `string?` | Free text search |
| `includeBuiltIn` | `boolean?` | Include built-in templates (default: true) |
| `includeExamples` | `boolean?` | Include example workflows (default: true) |
| `includeCustom` | `boolean?` | Include saved custom templates (default: true) |

```
Find templates for Flux txt2img
```

#### `get_template`
Build a workflow from a template with your parameters.

| Parameter | Type | Description |
|-----------|------|-------------|
| `templateId` | `string` | Template ID from search_templates |
| `parameters` | `object?` | Parameters to apply (prompt, model, etc.) |

```
Get the flux_schnell_txt2img template with prompt "a sunset over mountains"
```

#### `save_template`
Save a workflow as a reusable custom template. Use descriptive names!

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

#### `delete_template`
Delete a custom saved template.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Template ID to delete |

#### `list_examples`
List official ComfyUI example workflows. Over 70 workflows organized by model and use case.

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | `string?` | Filter by category (basics, sdxl, flux, video, audio, etc.) |

```
Show me example workflows for Flux
```

#### `get_example_workflow`
Fetch an example workflow from the ComfyUI documentation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Example name (e.g., "Flux Schnell Checkpoint") |
| `variant` | `number?` | Variant index if multiple (default: 0) |

```
Get the Flux Schnell Checkpoint workflow
```

#### `extract_workflow`
Extract workflow JSON from a ComfyUI-generated PNG image.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | Path to PNG file or URL |

```
Extract the workflow from this image: /path/to/comfyui_output.png
```

#### `recommend_workflow`
Get the correct workflow and settings for a model. **Call this BEFORE generating images** to ensure you're using the right workflow for your model (checkpoint vs UNET).

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelName` | `string` | Model filename (e.g., 'flux1-schnell-fp8.safetensors') |
| `taskType` | `"txt2img" \| "img2img" \| "inpaint" \| "edit" \| "video"` | Task type (default: "txt2img") |
| `availableCheckpoints` | `string[]?` | List of available checkpoints |
| `availableUnets` | `string[]?` | List of available UNETs |

Returns:
- Recommended workflow template
- Optimal settings (steps, CFG, resolution)
- Prompting guide for the model

```
What workflow should I use for flux1-schnell-fp8.safetensors?
```

#### `get_download_url`
Get download URL for a model by name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelName` | `string` | Model name to look up |

```
Where can I download flux1-schnell?
```

### Prompting Guide Tools

#### `get_prompting_guide`
Get prompting best practices for different model architectures.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelType` | `"sd15" \| "sdxl" \| "sd3" \| "flux" \| "all"` | Model type (default: all) |

Returns detailed guidance on:
- Prompt structure and style for each model
- Recommended keywords and techniques
- Negative prompt usage (or lack thereof for Flux)
- Common mistakes to avoid

```
How should I write prompts for Flux?
```

### Generation Tools

#### `run_workflow`
Run a ComfyUI workflow (API format JSON). This is the primary generation tool. Returns immediately with a task ID by default (async). Use `get_task` to check progress and `get_task_result` to retrieve results.

| Parameter | Type | Description |
|-----------|------|-------------|
| `workflow` | `object` | ComfyUI workflow JSON (API format) |
| `outputMode` | `"base64" \| "file" \| "auto"` | Output mode (default: "auto") |
| `name` | `string?` | Descriptive name for later retrieval (e.g., "sunset_portrait_v2") |
| `sync` | `boolean?` | Wait for completion (default: false, async) |
| `imageFormat` | `"jpeg" \| "png" \| "webp"` | Output format (default: "jpeg") |
| `imageQuality` | `number?` | Quality 1-100 for JPEG/WebP (default: 85) |

```
Run this workflow: [paste JSON]
```

#### `validate_workflow`
Validate a workflow before running. Checks node types, connections, and required inputs.

| Parameter | Type | Description |
|-----------|------|-------------|
| `workflow` | `object` | The workflow to validate |

Returns:
- `valid`: Whether the workflow is valid
- `errors`: Critical issues that will cause failures
- `warnings`: Non-critical issues to be aware of
- `info`: Helpful information about the workflow

```
Check if this workflow is valid before I run it
```

#### `get_image`
Retrieve a generated image as base64. Use this to fetch images from ComfyUI's output directory.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filename` | `string` | Image filename (e.g., 'ComfyUI_00001_.png') |
| `subfolder` | `string?` | Subfolder within the output directory |
| `type` | `"output" \| "input" \| "temp"` | Image location type (default: "output") |
| `imageFormat` | `"jpeg" \| "png" \| "webp"` | Output format (default: "jpeg") |
| `imageQuality` | `number?` | Quality 1-100 for JPEG/WebP (default: 85) |

```
Get the image named ComfyUI_00042_.png
```

### Workflow Composition Tools

#### `build_node`
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

#### `get_node_info`
Get detailed information about a node including inputs, outputs, example JSON, and tips.

| Parameter | Type | Description |
|-----------|------|-------------|
| `node` | `string` | Node class_type (e.g., "KSampler", "CheckpointLoaderSimple") |

Returns:
- Input specifications with types, defaults, and valid options
- Output types and slot indices
- Example JSON showing how to use the node
- Connection guide for each input type
- Tips for certain node types

```
What are the inputs for KSampler?
```

#### `find_nodes_by_type`
Find nodes by their input or output types. Useful for workflow composition.

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputType` | `string?` | Find nodes that accept this type (e.g., "MODEL", "LATENT") |
| `outputType` | `string?` | Find nodes that produce this type |

```
What nodes can output a MODEL?
```

#### `list_nodes`
List available ComfyUI nodes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | `string?` | Filter by category |
| `search` | `string?` | Search term |

```
What ControlNet nodes are available?
```

### Discovery Tools

#### `get_capabilities`
Get the detected capabilities of the connected ComfyUI instance.

```
What can this ComfyUI do? What models does it have?
```

#### `list_models`
List available models in ComfyUI.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `"all" \| "checkpoints" \| "loras" \| ...` | Model type filter |

```
What checkpoints do I have installed?
```

### Task & Queue Management

#### `get_task`
Get the status of an async generation task.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID |

#### `get_task_result`
Get the result of a completed generation task.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID |

#### `list_tasks`
List all generation tasks, optionally filtered by status.

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `"working" \| "completed" \| "failed" \| "cancelled"?` | Filter by status |

#### `cancel_task`
Cancel an async generation task. For queued tasks, this cancels the ComfyUI job. For running tasks, use `interrupt` to stop the generation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID to cancel |

#### `name_generation`
Assign a descriptive name to a generation for easy retrieval.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | `string` | The task ID to name |
| `name` | `string` | Descriptive name (e.g., "landscape_sunset_warm") |

#### `get_generation_by_name`
Retrieve a generation by its assigned name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | The name assigned to the generation |

#### `get_queue`
Get the current ComfyUI queue status.

```
What's in the generation queue?
```

#### `cancel_job`
Cancel a queued or running job.

| Parameter | Type | Description |
|-----------|------|-------------|
| `promptId` | `string?` | Job ID (empty = cancel all) |

```
Cancel the current job
```

#### `interrupt`
Interrupt the currently running job.

```
Stop the current generation
```

#### `get_history`
Get generation history.

| Parameter | Type | Description |
|-----------|------|-------------|
| `promptId` | `string?` | Specific job ID |
| `limit` | `number?` | Max entries (default: 10) |

```
Show recent generations
```

### Agent Memory Tools

These tools help AI agents remember learnings across sessions.

#### `save_note`
Save a note about something learned during image generation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `topic` | `string` | Topic/category (e.g., "flux-models", "prompting-tips") |
| `content` | `string` | The note content |
| `tags` | `string[]?` | Optional tags for searching |

```
Remember that Flux works best with natural language prompts
```

#### `get_notes`
Retrieve saved notes, optionally filtered by topic.

| Parameter | Type | Description |
|-----------|------|-------------|
| `topic` | `string?` | Filter by topic |
| `limit` | `number?` | Max notes to return |

#### `search_notes`
Search notes using full-text search.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Search query |
| `limit` | `number?` | Max notes to return |

#### `delete_note`
Delete a note by its ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `number` | The note ID to delete |

#### `list_topics`
List all unique topics that have notes.

```
What topics have I saved notes about?
```

### User Preferences Tools

#### `get_user_preferences`
Get user preferences extracted from analyzing their ComfyUI output history. Returns commonly used workflows, frequently used models, and preferred settings.

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeWorkflows` | `boolean?` | Include workflow templates (default: true) |
| `includeModels` | `boolean?` | Include model usage stats (default: true) |
| `includeSettings` | `boolean?` | Include common settings (default: true) |
| `workflowLimit` | `number?` | Max workflow templates to return (default: 20) |
| `modelLimit` | `number?` | Max models to return (default: 30) |

```
What workflows and models do I use most often?
```

### SVG & Font Tools

These tools allow creating precise base images for img2img workflows using SVG.

#### `render_svg`
Render SVG content to PNG and save to ComfyUI's input folder. Returns filename for use in LoadImage nodes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `svg` | `string` | SVG content (full markup including `<svg>` tags) |
| `filename` | `string?` | Output filename without extension |
| `width` | `number?` | Output width in pixels (default: 768) |
| `height` | `number?` | Output height in pixels (default: 768) |
| `background` | `string?` | Background color (hex like '#ffffff' or 'transparent') |
| `fonts` | `array?` | Fonts to embed (each with `name` and optional `family`) |

```
Render this map SVG as a base for img2img
```

#### `download_font`
Download a font from Google Fonts or a direct URL for use in SVG rendering.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `object` | Font source (see below) |

**Google Fonts source:**
```json
{ "type": "google", "family": "Cinzel", "weight": 400 }
```

**URL source:**
```json
{ "type": "url", "url": "https://...", "name": "MyFont" }
```

Popular fantasy/map fonts available on Google Fonts: Cinzel, Pirata One, MedievalSharp, UnifrakturMaguntia, Almendra.

#### `list_fonts`
List all downloaded fonts available for use in SVG rendering.

```
What fonts do I have available for SVG rendering?
```

---

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `COMFYUI_URL` | Override ComfyUI URL (skips auto-discovery) |

### Config File

Location:
- **macOS**: `~/Library/Application Support/comfyui-mcp/config.json`
- **Windows**: `%APPDATA%/comfyui-mcp/config.json`
- **Linux**: `~/.config/comfyui-mcp/config.json`

```json
{
  "comfyui": {
    "url": "http://localhost:8188",
    "apiKey": null
  },
  "outputDir": "./outputs",
  "workflowsDir": "./workflows",
  "outputSizeThreshold": 1048576
}
```

---

## How It Works

### Auto-Discovery

The server discovers ComfyUI in this order:
1. `COMFYUI_URL` environment variable
2. Config file URL
3. ComfyUI Desktop app configuration files
4. Port scanning: localhost:8188, 8189, 8190

### Capability Detection

On connection, the server queries ComfyUI's `/object_info` endpoint to detect:

- **Model Architectures**: SD 1.5, SDXL, SD3, Flux, Cascade (based on available checkpoints/UNETs)
- **Extensions**: LoRA, ControlNet, IP-Adapter, AnimateDiff, etc. (based on available nodes)
- **Features**: Video generation, audio generation, upscaling, inpainting
- **Samplers & Schedulers**: Reads available options from KSampler node

### Workflow Execution

When you call `run_workflow`, the server:
1. Validates the workflow structure
2. Queues the workflow via WebSocket for real-time progress
3. Tracks the task (async by default, or waits if sync=true)
4. Retrieves and returns the output images

---

## Example Conversations

### First-Time Setup
```
User: I want to use ComfyUI but I don't have it installed
Claude: [Uses get_install_guide] Here's how to install ComfyUI...
Claude: [Uses get_model_guide] Here's how to download and set up models...
```

### Generate Images with Templates
```
User: Generate a pirate husky with Flux
Claude: [Uses list_models] Found flux1-schnell-fp8.safetensors...
Claude: [Uses search_templates] Found "flux_schnell_txt2img" template...
Claude: [Uses get_prompting_guide('flux')] Flux uses natural language prompts...
Claude: [Uses get_template with parameters] Built workflow...
Claude: [Uses validate_workflow] Workflow is valid...
Claude: [Uses run_workflow] Generated image!
[Image displayed]
```

### Custom Workflow Composition
```
User: I want to build a custom workflow with ControlNet
Claude: [Uses list_nodes(category="controlnet")] Here are the ControlNet nodes...
Claude: [Uses get_node_info("ControlNetApply")] Here's how to use it...
Claude: [Uses build_node] Building each node...
Claude: [Uses validate_workflow] Checking the workflow...
Claude: [Uses run_workflow] Running your custom workflow...
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

### Docker Build

```bash
docker build -t comfyui-mcp .
docker run -it --network=host comfyui-mcp
```

### Testing with MCP Inspector

```bash
npm run inspector
```

---

## Troubleshooting

### ComfyUI not detected
1. Make sure ComfyUI is running
2. Check if it's accessible at http://localhost:8188
3. Set `COMFYUI_URL` environment variable if using non-default port

### Models not found
1. Ensure models are in the correct ComfyUI subdirectory
2. Restart ComfyUI after adding new models
3. Use `list_models` to see what's detected

### Generation fails
1. Use `validate_workflow` to check for issues
2. Check `get_queue` for error messages
3. Verify the model exists with `list_models`
4. Try simpler parameters (smaller size, fewer steps)

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
