import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { extractWorkflowFromPng } from "../tools/examples.js";
import {
  Workflow,
  hashWorkflowStructure,
  extractModelsFromWorkflow,
  extractPromptsFromWorkflow,
  extractSettingsFromWorkflow,
  describeWorkflow,
} from "./hash.js";

/**
 * A workflow template extracted from user outputs
 */
export interface WorkflowTemplate {
  hash: string;
  workflow: Workflow;
  usageCount: number;
  lastUsed: string;
  models: string[];
  description: string;
  samplePrompts: string[];
}

/**
 * Model usage statistics
 */
export interface ModelUsage {
  name: string;
  type: string;
  usageCount: number;
  lastUsed: string;
}

/**
 * Common generation settings
 */
export interface CommonSettings {
  preferredSamplers: string[];
  preferredSchedulers: string[];
  commonResolutions: string[];
  averageSteps: number;
}

/**
 * User preferences extracted from output analysis
 */
export interface UserPreferences {
  totalImagesAnalyzed: number;
  imagesWithWorkflows: number;
  uniqueWorkflows: number;
  workflowTemplates: WorkflowTemplate[];
  modelUsage: ModelUsage[];
  commonSettings: CommonSettings;
  analyzedAt: string;
}

/**
 * Internal tracking during analysis
 */
interface WorkflowBucket {
  hash: string;
  workflow: Workflow;
  count: number;
  lastUsed: Date;
  prompts: Set<string>;
}

interface ModelBucket {
  name: string;
  type: string;
  count: number;
  lastUsed: Date;
}

interface SettingsBucket {
  samplers: Map<string, number>;
  schedulers: Map<string, number>;
  resolutions: Map<string, number>;
  totalSteps: number;
  stepsCount: number;
}

// Maximum images to analyze to prevent excessive processing time
const MAX_IMAGES = 10000;

// Maximum sample prompts to keep per workflow template
const MAX_SAMPLE_PROMPTS = 5;

/**
 * Recursively find all PNG files in a directory
 */
async function findPngFiles(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        await findPngFiles(fullPath, files);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
        files.push(fullPath);
      }

      // Stop if we've found enough files
      if (files.length >= MAX_IMAGES) {
        break;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read - skip silently
  }

  return files;
}

/**
 * Get file modification time
 */
async function getFileMtime(filePath: string): Promise<Date> {
  try {
    const stats = await stat(filePath);
    return stats.mtime;
  } catch {
    return new Date(0);
  }
}

/**
 * Analyze ComfyUI output directory to extract user preferences
 */
export async function analyzeUserOutputs(outputPath: string): Promise<UserPreferences> {
  console.error(`[analysis] Starting output analysis of: ${outputPath}`);

  // Find all PNG files
  const pngFiles = await findPngFiles(outputPath);
  console.error(`[analysis] Found ${pngFiles.length} PNG files`);

  // Tracking buckets
  const workflowBuckets = new Map<string, WorkflowBucket>();
  const modelBuckets = new Map<string, ModelBucket>();
  const settings: SettingsBucket = {
    samplers: new Map(),
    schedulers: new Map(),
    resolutions: new Map(),
    totalSteps: 0,
    stepsCount: 0,
  };

  let imagesWithWorkflows = 0;

  // Process each PNG file
  for (const filePath of pngFiles) {
    try {
      const fileData = await readFile(filePath);
      const metadata = await extractWorkflowFromPng(fileData.buffer as ArrayBuffer);

      if (!metadata) continue;

      // Prefer prompt (API format) over workflow (UI format)
      const workflow = (metadata.prompt || metadata.workflow) as Workflow | undefined;
      if (!workflow || typeof workflow !== "object") continue;

      imagesWithWorkflows++;

      // Get file modification time for "last used" tracking
      const mtime = await getFileMtime(filePath);

      // Hash the workflow structure
      const hash = hashWorkflowStructure(workflow);

      // Update workflow bucket
      let bucket = workflowBuckets.get(hash);
      if (!bucket) {
        bucket = {
          hash,
          workflow,
          count: 0,
          lastUsed: mtime,
          prompts: new Set(),
        };
        workflowBuckets.set(hash, bucket);
      }
      bucket.count++;
      if (mtime > bucket.lastUsed) {
        bucket.lastUsed = mtime;
      }

      // Extract and track prompts
      const prompts = extractPromptsFromWorkflow(workflow);
      for (const p of prompts.positive) {
        if (p.trim() && bucket.prompts.size < MAX_SAMPLE_PROMPTS) {
          bucket.prompts.add(p.trim().slice(0, 200)); // Truncate long prompts
        }
      }

      // Extract and track models
      const models = extractModelsFromWorkflow(workflow);
      for (const model of models) {
        const modelKey = model.name;
        let modelBucket = modelBuckets.get(modelKey);
        if (!modelBucket) {
          modelBucket = {
            name: model.name,
            type: model.type,
            count: 0,
            lastUsed: mtime,
          };
          modelBuckets.set(modelKey, modelBucket);
        }
        modelBucket.count++;
        if (mtime > modelBucket.lastUsed) {
          modelBucket.lastUsed = mtime;
        }
      }

      // Extract and track settings
      const workflowSettings = extractSettingsFromWorkflow(workflow);
      if (workflowSettings.sampler) {
        const count = settings.samplers.get(workflowSettings.sampler) || 0;
        settings.samplers.set(workflowSettings.sampler, count + 1);
      }
      if (workflowSettings.scheduler) {
        const count = settings.schedulers.get(workflowSettings.scheduler) || 0;
        settings.schedulers.set(workflowSettings.scheduler, count + 1);
      }
      if (workflowSettings.width && workflowSettings.height) {
        const res = `${workflowSettings.width}x${workflowSettings.height}`;
        const count = settings.resolutions.get(res) || 0;
        settings.resolutions.set(res, count + 1);
      }
      if (workflowSettings.steps) {
        settings.totalSteps += workflowSettings.steps;
        settings.stepsCount++;
      }
    } catch {
      // Skip files that can't be read or parsed
      continue;
    }
  }

  console.error(`[analysis] Processed ${imagesWithWorkflows} images with workflow metadata`);
  console.error(`[analysis] Found ${workflowBuckets.size} unique workflows`);

  // Convert buckets to sorted arrays
  const workflowTemplates: WorkflowTemplate[] = Array.from(workflowBuckets.values())
    .map((bucket) => ({
      hash: bucket.hash,
      workflow: bucket.workflow,
      usageCount: bucket.count,
      lastUsed: bucket.lastUsed.toISOString(),
      models: extractModelsFromWorkflow(bucket.workflow).map((m) => m.name),
      description: describeWorkflow(bucket.workflow),
      samplePrompts: Array.from(bucket.prompts),
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 20); // Keep top 20 workflows

  const modelUsage: ModelUsage[] = Array.from(modelBuckets.values())
    .map((bucket) => ({
      name: bucket.name,
      type: bucket.type,
      usageCount: bucket.count,
      lastUsed: bucket.lastUsed.toISOString(),
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 30); // Keep top 30 models

  // Calculate common settings
  const preferredSamplers = Array.from(settings.samplers.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const preferredSchedulers = Array.from(settings.schedulers.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const commonResolutions = Array.from(settings.resolutions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([res]) => res);

  const averageSteps =
    settings.stepsCount > 0 ? Math.round(settings.totalSteps / settings.stepsCount) : 20;

  return {
    totalImagesAnalyzed: pngFiles.length,
    imagesWithWorkflows,
    uniqueWorkflows: workflowBuckets.size,
    workflowTemplates,
    modelUsage,
    commonSettings: {
      preferredSamplers,
      preferredSchedulers,
      commonResolutions,
      averageSteps,
    },
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Generate a summary string for user preferences
 */
export function getUserPreferencesSummary(prefs: UserPreferences): string {
  const lines: string[] = [];

  lines.push(`Analyzed ${prefs.totalImagesAnalyzed} images (${prefs.imagesWithWorkflows} with workflow data)`);
  lines.push(`Found ${prefs.uniqueWorkflows} unique workflow templates`);

  if (prefs.workflowTemplates.length > 0) {
    lines.push("\nTop workflows:");
    for (const wf of prefs.workflowTemplates.slice(0, 5)) {
      lines.push(`  - ${wf.description} (${wf.usageCount} uses)`);
    }
  }

  if (prefs.modelUsage.length > 0) {
    lines.push("\nMost used models:");
    for (const model of prefs.modelUsage.slice(0, 5)) {
      lines.push(`  - ${model.name} (${model.usageCount} uses)`);
    }
  }

  if (prefs.commonSettings.preferredSamplers.length > 0) {
    lines.push(`\nPreferred sampler: ${prefs.commonSettings.preferredSamplers[0]}`);
  }
  if (prefs.commonSettings.preferredSchedulers.length > 0) {
    lines.push(`Preferred scheduler: ${prefs.commonSettings.preferredSchedulers[0]}`);
  }
  if (prefs.commonSettings.commonResolutions.length > 0) {
    lines.push(`Common resolution: ${prefs.commonSettings.commonResolutions[0]}`);
  }
  lines.push(`Average steps: ${prefs.commonSettings.averageSteps}`);

  return lines.join("\n");
}
