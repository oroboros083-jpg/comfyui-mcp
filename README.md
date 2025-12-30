# ComfyUI MCP Server

[![Build and Publish](https://github.com/shawnrushefsky/comfyui-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/shawnrushefsky/comfyui-mcp/actions/workflows/publish.yml)

An MCP (Model Context Protocol) server that enables AI assistants like Claude to interact with [ComfyUI](https://github.com/comfyanonymous/ComfyUI) for generating images, audio, video, and more.

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

### Example Workflow Support
Fetches real workflow JSON from the [official ComfyUI examples](https://comfyanonymous.github.io/ComfyUI_examples/) by extracting embedded metadata from the documentation images.

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

### Step 3: Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "comfyui": {
      "command": "npx",
      "args": ["-y", "comfyui-mcp"]
    }
  }
}
```

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

### Option 1: Claude Desktop (Recommended)

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "comfyui": {
      "command": "npx",
      "args": ["-y", "comfyui-mcp"]
    }
  }
}
```

### Option 2: Docker

```json
{
  "mcpServers": {
    "comfyui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--network=host",
        "ghcr.io/shawnrushefsky/comfyui-mcp:latest"
      ]
    }
  }
}
```

### Option 3: From Source

```bash
git clone https://github.com/shawnrushefsky/comfyui-mcp.git
cd comfyui-mcp
npm install
npm run build
npm start
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

### Download Tools

#### `list_downloads`
List popular models available for direct download.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `"all" \| "checkpoint" \| "unet" \| "clip" \| "vae" \| "lora" \| "controlnet" \| "upscale"` | Filter by type |

```
What models can you download for me?
```

#### `download_model`
Download a known model directly to ComfyUI.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Model name (from list_downloads) |
| `comfyuiPath` | `string?` | ComfyUI installation path |

```
Download the SDXL base model
```

#### `download_huggingface`
Download any model file from HuggingFace.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | HuggingFace repo (e.g., "stabilityai/stable-diffusion-xl-base-1.0") |
| `filename` | `string` | File to download |
| `destType` | `string` | Model type (determines folder) |

```
Download the flux1-dev model from black-forest-labs
```

### Example Workflow Tools

#### `list_examples`
List official ComfyUI example workflows.

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | `string?` | Filter by category (basics, sdxl, flux, video, audio, etc.) |

```
Show me example workflows for video generation
```

#### `get_example_workflow`
Fetch an example workflow from the ComfyUI documentation. Extracts the embedded JSON from documentation images.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Example name |
| `variant` | `number?` | Variant index (default: 0) |

```
Get the Flux example workflow
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
Claude: [Uses download_model] I'll download the SDXL base model for you...
```

### Generate Images
```
User: Create a picture of a cat wearing a top hat
Claude: [Uses generate_image] Generated 1 image using standard workflow...
[Image displayed]
```

### Advanced Workflow
```
User: I want to use a specific workflow from the ComfyUI examples
Claude: [Uses list_examples] Here are the available examples...
User: Get the ControlNet one
Claude: [Uses get_example_workflow] Here's the workflow JSON...
Claude: [Uses run_workflow] Running the workflow...
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
