import { z } from "zod";
import { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import { WorkflowNode } from "../workflows/builder.js";

export const validateWorkflowSchema = z.object({
  workflow: z
    .record(z.unknown())
    .describe("The ComfyUI workflow JSON (API format) to validate"),
});

export type ValidateWorkflowInput = z.infer<typeof validateWorkflowSchema>;

interface ValidationError {
  nodeId: string;
  type: "unknown_node" | "missing_input" | "invalid_connection" | "type_mismatch" | "invalid_slot";
  message: string;
  details?: Record<string, unknown>;
}

interface ValidationWarning {
  nodeId: string;
  type: "unused_output" | "deprecated_node" | "no_output_node" | "missing_optional";
  message: string;
}

interface ValidationResult {
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
): Promise<string> {
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

    // Record output types for this node
    const nodeOutputs = new Map<number, string>();
    nodeInfo.output.forEach((type, i) => {
      nodeOutputs.set(i, type.toUpperCase());
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

  // Check for output nodes (SaveImage, PreviewImage, etc.)
  const outputNodeTypes = [
    "SaveImage",
    "PreviewImage",
    "SaveAnimatedWEBP",
    "SaveAnimatedPNG",
    "SaveVideo",
    "PreviewVideo",
    "SaveAudio",
    "PreviewAudio",
  ];
  const hasOutputNode = Object.values(workflow).some((node) =>
    outputNodeTypes.some(
      (t) => node.class_type === t || node.class_type?.includes("Save") || node.class_type?.includes("Preview")
    )
  );

  if (!hasOutputNode) {
    warnings.push({
      nodeId: "_workflow",
      type: "no_output_node",
      message: "Workflow has no output node (SaveImage, PreviewImage, etc.). Results may not be retrievable.",
    });
  }

  const result: ValidationResult = {
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

  return JSON.stringify(result, null, 2);
}
