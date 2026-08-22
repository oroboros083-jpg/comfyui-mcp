import { z } from "zod";
import { ComfyUIClient } from "../client/comfyui.js";
import { WorkflowNode } from "../workflows/builder.js";
import { responseFormatField } from "../utils/response.js";
import { outputTypeName } from "./models.js";

export const validateWorkflowSchema = z.object({
  workflow: z
    .record(z.unknown())
    .describe("The ComfyUI workflow JSON (API format) to validate"),
  response_format: responseFormatField,
}).strict();

export type ValidateWorkflowInput = z.infer<typeof validateWorkflowSchema>;

export interface ValidationError {
  nodeId: string;
  type: "unknown_node" | "missing_input" | "invalid_connection" | "type_mismatch" | "invalid_slot";
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  nodeId: string;
  type: "unused_output" | "deprecated_node" | "no_output_node" | "missing_optional";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: string;
  nodeCount: number;
  nodeTypes: string[];
}

/**
 * Parse input spec to get the expected type
 */
function getInputType(spec: unknown): string {
  if (!Array.isArray(spec) || spec.length === 0) {
    return "UNKNOWN";
  }
  const [typeOrOptions] = spec;
  if (Array.isArray(typeOrOptions)) {
    return "COMBO";
  }
  return String(typeOrOptions).toUpperCase();
}

/**
 * Validate a workflow before running it
 */
export async function validateWorkflow(
  client: ComfyUIClient,
  input: ValidateWorkflowInput
): Promise<ValidationResult> {
  const objectInfo = await client.getObjectInfo();
  const workflow = input.workflow as Record<string, WorkflowNode>;

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const nodeTypes: string[] = [];

  // Build output type map: nodeId -> slot -> type
  const outputTypes: Map<string, Map<number, string>> = new Map();

  // First pass: validate node types exist and build output map
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node.class_type) {
      errors.push({
        nodeId,
        type: "unknown_node",
        message: `Node ${nodeId} is missing class_type`,
      });
      continue;
    }

    const nodeInfo = objectInfo[node.class_type];
    if (!nodeInfo) {
      // Try case-insensitive search
      const match = Object.keys(objectInfo).find(
        (k) => k.toLowerCase() === node.class_type.toLowerCase()
      );
      if (match) {
        errors.push({
          nodeId,
          type: "unknown_node",
          message: `Unknown node type: '${node.class_type}'. Did you mean '${match}'?`,
        });
      } else {
        errors.push({
          nodeId,
          type: "unknown_node",
          message: `Unknown node type: '${node.class_type}'`,
        });
      }
      continue;
    }

    nodeTypes.push(node.class_type);

    // Record output types for this node.
    //
    // A COMBO output arrives as its array of options, and a build can omit
    // `output` entirely, so both go through the shared normaliser rather
    // than a bare toUpperCase - which threw and took the whole tool down on
    // any workflow containing such a node.
    const nodeOutputs = new Map<number, string>();
    const rawOutputs = Array.isArray(nodeInfo.output) ? nodeInfo.output : [];
    rawOutputs.forEach((type, i) => {
      nodeOutputs.set(i, outputTypeName(type));
    });
    outputTypes.set(nodeId, nodeOutputs);
  }

  // Second pass: validate connections and inputs
  for (const [nodeId, node] of Object.entries(workflow)) {
    const nodeInfo = objectInfo[node.class_type];
    if (!nodeInfo) continue; // Already reported

    const inputs = node.inputs || {};

    // Check required inputs
    if (nodeInfo.input.required) {
      for (const [inputName, spec] of Object.entries(nodeInfo.input.required)) {
        if (!(inputName in inputs)) {
          errors.push({
            nodeId,
            type: "missing_input",
            message: `Missing required input '${inputName}' on node ${nodeId} (${node.class_type})`,
            details: { inputName, nodeType: node.class_type },
          });
          continue;
        }

        const value = inputs[inputName];
        const expectedType = getInputType(spec);

        // Check if it's a connection reference [nodeId, slot]
        if (
          Array.isArray(value) &&
          value.length === 2 &&
          typeof value[0] === "string" &&
          typeof value[1] === "number"
        ) {
          const [sourceNodeId, slot] = value as [string, number];
          const sourceOutputs = outputTypes.get(sourceNodeId);

          if (!sourceOutputs) {
            errors.push({
              nodeId,
              type: "invalid_connection",
              message: `Input '${inputName}' references non-existent node '${sourceNodeId}'`,
              details: { inputName, sourceNodeId, slot },
            });
          } else {
            const outputType = sourceOutputs.get(slot);
            if (outputType === undefined) {
              errors.push({
                nodeId,
                type: "invalid_slot",
                message: `Input '${inputName}' references invalid output slot ${slot} on node '${sourceNodeId}'`,
                details: { inputName, sourceNodeId, slot, availableSlots: Array.from(sourceOutputs.keys()) },
              });
            } else if (expectedType !== "COMBO" && expectedType !== "*" && outputType !== "*") {
              // Check type compatibility (some types like * are wildcards)
              if (outputType !== expectedType) {
                errors.push({
                  nodeId,
                  type: "type_mismatch",
                  message: `Type mismatch: '${inputName}' expects ${expectedType}, but node '${sourceNodeId}' output ${slot} is ${outputType}`,
                  details: { inputName, expectedType, actualType: outputType, sourceNodeId, slot },
                });
              }
            }
          }
        }
        // Primitive values are validated by ComfyUI itself
      }
    }

    // Check for missing optional inputs that might cause issues (just warn)
    if (nodeInfo.input.optional) {
      for (const [inputName, spec] of Object.entries(nodeInfo.input.optional)) {
        const parsedSpec = spec as unknown[];
        if (parsedSpec[1] && typeof parsedSpec[1] === "object") {
          const config = parsedSpec[1] as Record<string, unknown>;
          // Some optional inputs have forceInput which means they really should be connected
          if (config.forceInput && !(inputName in inputs)) {
            warnings.push({
              nodeId,
              type: "missing_optional",
              message: `Optional input '${inputName}' on node ${nodeId} (${node.class_type}) is typically connected`,
            });
          }
        }
      }
    }
  }

  // Check for output nodes.
  //
  // ComfyUI publishes OUTPUT_NODE per node type, so ask it rather than
  // guessing from the class name. The name heuristic this replaced matched
  // only "Save"/"Preview" substrings, which misses every sink a custom pack
  // supplies - VHS_VideoCombine, the standard video output node, contains
  // neither - so correct video workflows were told their results might not be
  // retrievable. The heuristic stays as a fallback for builds old enough not
  // to publish the flag.
  const hasOutputNode = Object.values(workflow).some((node) => {
    const info = objectInfo[node.class_type];
    if (info?.output_node !== undefined) return info.output_node;
    return (
      node.class_type?.includes("Save") ||
      node.class_type?.includes("Preview") ||
      node.class_type?.includes("Combine")
    );
  });

  if (!hasOutputNode) {
    warnings.push({
      nodeId: "_workflow",
      type: "no_output_node",
      message: "Workflow has no output node (SaveImage, PreviewImage, etc.). Results may not be retrievable.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeCount: Object.keys(workflow).length,
    nodeTypes: [...new Set(nodeTypes)],
    summary:
      errors.length === 0
        ? `Workflow is valid with ${Object.keys(workflow).length} nodes` +
          (warnings.length > 0 ? ` (${warnings.length} warnings)` : "")
        : `Workflow has ${errors.length} error(s) and ${warnings.length} warning(s)`,
  };
}

/** Human-readable rendering of a validation result. */
export function renderValidation(result: ValidationResult): string {
  const lines = [
    `# Workflow Validation: ${result.valid ? "PASSED" : "FAILED"}`,
    "",
    result.summary,
    "",
    `${result.nodeCount} nodes across ${result.nodeTypes.length} node types.`,
  ];

  if (result.errors.length) {
    lines.push("", "## Errors");
    for (const e of result.errors) {
      lines.push(`- **${e.nodeId}** (${e.type}): ${e.message}`);
    }
  }
  if (result.warnings.length) {
    lines.push("", "## Warnings");
    for (const w of result.warnings) {
      lines.push(`- **${w.nodeId}** (${w.type}): ${w.message}`);
    }
  }
  if (result.valid && !result.warnings.length) {
    lines.push("", "No errors or warnings. Safe to run with comfyui_run_workflow.");
  }
  return lines.join("\n");
}
