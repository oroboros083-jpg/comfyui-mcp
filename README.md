# ComfyUI MCP Server

- [ComfyUI MCP Server](#comfyui-mcp-server)
  - [Let Your AI Install This For You](#let-your-ai-install-this-for-you)
  - [What is This?](#what-is-this)
  - [Key Features](#key-features)
    - [Self-Configuring](#self-configuring)
    - [Works Without ComfyUI Running](#works-without-comfyui-running)
    - [Dynamic Workflow Generation](#dynamic-workflow-generation)
    - [70+ Example Workflows](#70-example-workflows)
    - [Smart Workflow Recommendation](#smart-workflow-recommendation)
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
      - [`get_install_guide`](#get_install_guide)
      - [`get_model_guide`](#get_model_guide)
    - [Example \& Workflow Tools](#example--workflow-tools)
      - [`list_examples`](#list_examples)
      - [`get_example_workflow`](#get_example_workflow)
      - [`recommend_workflow`](#recommend_workflow)
      - [`extract_workflow`](#extract_workflow)
    - [Prompting Guide Tools](#prompting-guide-tools)
      - [`get_prompting_guide`](#get_prompting_guide)
    - [Generation Tools](#generation-tools)
      - [`generate_image`](#generate_image)
      - [`run_workflow`](#run_workflow)
    - [Discovery Tools](#discovery-tools)
      - [`get_capabilities`](#get_capabilities)
      - [`list_models`](#list_models)
      - [`list_nodes`](#list_nodes)
      - [`get_node_info`](#get_node_info)
      - [`find_nodes_by_type`](#find_nodes_by_type)
    - [Queue Management Tools](#queue-management-tools)
      - [`get_queue`](#get_queue)
      - [`cancel_job`](#cancel_job)
      - [`interrupt`](#interrupt)
      - [`get_history`](#get_history)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
    - [Config File](#config-file)
  - [How It Works](#how-it-works)
    - [Auto-Discovery](#auto-discovery)
    - [Capability Detection](#capability-detection)
    - [Dynamic Workflow Building](#dynamic-workflow-building)
  - [Example Conversations](#example-conversations)
    - [First-Time Setup](#first-time-setup)
    - [Generate Images](#generate-images)
    - [Advanced Workflow](#advanced-workflow)
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

5. Use recommend_workflow with my model name to get the correct workflow and settings.

6. Use get_prompting_guide to learn the correct prompting style for my model.

7. Then generate a test image to verify everything works.
```

> **Tip**: If you're using the ComfyUI Desktop app, it runs on port 8000. If you installed ComfyUI manually, change the port to 8188.

---

## What is This?

This MCP server acts as a bridge between AI assistants and ComfyUI, the powerful node-based interface for Stable Diffusion and other generative AI models. It allows Claude and other MCP-compatible AI assistants to:

- **Generate images** from text prompts using any model you have installed
- **Run complex workflows** with multiple models, LoRAs, ControlNets, and more
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

### Dynamic Workflow Generation
Instead of requiring you to build ComfyUI workflows, the server dynamically generates appropriate workflows based on:
- What models you have installed (SD 1.5, SDXL, Flux, etc.)
- What nodes are available
- What parameters you specify

### 70+ Example Workflows
Comprehensive library of example workflows from the [official ComfyUI documentation](https://comfyanonymous.github.io/ComfyUI_examples/), split into easily discoverable entries:
- **Flux**: Dev, Schnell, Checkpoint variants, Kontext, Fill, Redux, Canny, Depth, ControlNet
- **SDXL**: Base, Refiner, ReVision (image-guided)
- **SD3.5**: Separate encoders, Checkpoint, Medium, Turbo, ControlNet
- **ControlNet**: Scribble, Depth, T2I-Adapter, Pose, Multiple combined
- **Inpainting/Outpainting**: Basic, dedicated models, various techniques
- **Video**: SVD, Mochi, LTX-Video, Hunyuan Video, Cosmos, Wan
- **And more**: Stable Cascade, HiDream, Qwen Image, Audio generation

### Smart Workflow Recommendation
The `recommend_workflow` tool matches your model files to the correct workflow:
- Distinguishes between checkpoint files and UNET files
- Returns optimal settings (steps, CFG, resolution, sampler)
- Suggests the right prompting guide for each model type
- Prevents common mistakes like using wrong loaders

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
Generate an image of a sunset over mountains
```

Claude will automatically:
- Connect to your ComfyUI instance
- Detect available models
- Build an appropriate workflow
- Generate and display the image

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
Get the current status of ComfyUI connection and installation.

```
What's the status of ComfyUI?
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

### Example & Workflow Tools

#### `list_examples`
List official ComfyUI example workflows. Over 70 workflows organized by model and use case.

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | `string?` | Filter by category (basics, sdxl, flux, video, audio, etc.) |

```
Show me example workflows for Flux
```

#### `get_example_workflow`
Fetch an example workflow from the ComfyUI documentation. Extracts the embedded JSON from documentation images.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Example name (e.g., "Flux Schnell Checkpoint") |
| `variant` | `number?` | Variant index if multiple (default: 0) |

```
Get the Flux Schnell Checkpoint workflow
```

#### `recommend_workflow`
**Call this before generating!** Matches a model filename to the correct workflow and optimal settings.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modelName` | `string` | Model filename (e.g., "flux1-schnell-fp8.safetensors") |
| `availableCheckpoints` | `string[]?` | List of checkpoint files (from list_models) |
| `availableUnets` | `string[]?` | List of UNET files (from list_models) |
| `taskType` | `"txt2img" \| "img2img" \| "inpaint" \| "edit" \| "video"` | Task type (default: txt2img) |

Returns:
- Recommended workflow name
- Model type (sd15, sdxl, sd3, flux)
- Loader type (CheckpointLoaderSimple vs UNETLoader)
- Optimal settings (steps, CFG, resolution, sampler, scheduler)
- Prompting guide reference
- Alternative workflows for the task

```
Which workflow should I use for flux1-schnell-fp8.safetensors?
```

#### `extract_workflow`
Extract workflow JSON from a ComfyUI-generated PNG image.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | Path to PNG file or URL |

```
Extract the workflow from this image: /path/to/comfyui_output.png
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

#### `generate_image`
Generate an image using ComfyUI. Automatically selects the appropriate workflow.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `string` | (required) | What to generate |
| `negativePrompt` | `string?` | `""` | What to avoid |
| `model` | `string?` | auto | Checkpoint or UNET name |
| `width` | `number?` | `1024` | Image width |
| `height` | `number?` | `1024` | Image height |
| `steps` | `number?` | `20` | Sampling steps |
| `cfg` | `number?` | `7` | CFG/guidance scale |
| `seed` | `number?` | `-1` | Seed (-1 = random) |
| `sampler` | `string?` | auto | Sampler name |
| `scheduler` | `string?` | auto | Scheduler |
| `batchSize` | `number?` | `1` | Number of images |
| `outputMode` | `"base64" \| "file" \| "auto"` | `"auto"` | How to return output |

```
Generate an image of a sunset over mountains, 1920x1080, using 30 steps
```

#### `run_workflow`
Run a custom ComfyUI workflow (API format JSON).

| Parameter | Type | Description |
|-----------|------|-------------|
| `workflow` | `object` | ComfyUI workflow JSON |
| `outputMode` | `"base64" \| "file" \| "auto"` | Output mode |

```
Run this workflow: [paste JSON]
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

#### `list_nodes`
List available ComfyUI nodes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | `string?` | Filter by category |
| `search` | `string?` | Search term |

```
What ControlNet nodes are available?
```

#### `get_node_info`
Get detailed information about a specific node including inputs, outputs, and valid options.

| Parameter | Type | Description |
|-----------|------|-------------|
| `node` | `string` | Node class_type (e.g., "KSampler", "CheckpointLoaderSimple") |

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

### Queue Management Tools

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

### Dynamic Workflow Building

When you call `generate_image`, the server:
1. Checks what model type you're using (or auto-detects from available models)
2. Builds an appropriate workflow for that model type
3. Uses available samplers/schedulers
4. Queues the workflow via WebSocket for real-time progress
5. Retrieves and returns the output

---

## Example Conversations

### First-Time Setup
```
User: I want to use ComfyUI but I don't have it installed
Claude: [Uses get_install_guide] Here's how to install ComfyUI...
Claude: [Uses get_model_guide] Here's how to download and set up models...
```

### Generate Images with Correct Settings
```
User: Generate a pirate husky with flux schnell
Claude: [Uses list_models] Found flux1-schnell-fp8.safetensors in checkpoints...
Claude: [Uses recommend_workflow] Recommending "Flux Schnell Checkpoint" workflow
        - Steps: 4, CFG: 1, Sampler: euler, Scheduler: simple
Claude: [Uses get_prompting_guide('flux')] Flux uses natural language prompts...
Claude: [Uses generate_image with correct settings] Generated image!
[Image displayed]
```

### Advanced Workflow
```
User: I want to use a specific workflow from the ComfyUI examples
Claude: [Uses list_examples] Here are 70+ available examples organized by model...
User: Get the Flux Fill inpainting one
Claude: [Uses get_example_workflow("Flux Fill (Inpaint/Outpaint)")] Here's the workflow...
Claude: [Uses run_workflow] Running the inpainting workflow...
```

### Custom Workflow from Image
```
User: I have a ComfyUI output image with a workflow I want to reuse
Claude: [Uses extract_workflow] Extracted workflow from the PNG metadata...
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
1. Check `get_queue` for error messages
2. Verify the model exists with `list_models`
3. Try simpler parameters (smaller size, fewer steps)

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
