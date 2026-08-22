import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the db module at a scratch file before anything loads it: the handle
// is resolved once and cached. Same approach as db/index.test.ts.
const dir = mkdtempSync(join(tmpdir(), "comfyui-apply-params-test-"));
process.env.COMFYUI_MCP_DB_PATH = join(dir, "test.db");

const { saveCustomTemplate, getTemplate } = await import("./templates.js");
const { ComfyUIClient } = await import("../../client/comfyui.js");

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* left for the OS to reap */
  }
});

/** A client with one checkpoint, enough for the builder paths getTemplate touches. */
function client(): InstanceType<typeof ComfyUIClient> {
  return {
    getObjectInfo: async () => ({
      CheckpointLoaderSimple: {
        name: "CheckpointLoaderSimple",
        display_name: "Load Checkpoint",
        category: "loaders",
        description: "",
        input: { required: { ckpt_name: ["COMBO", { options: ["sdxl.safetensors"] }] } },
        output: ["MODEL", "CLIP", "VAE"],
        output_name: ["MODEL", "CLIP", "VAE"],
        output_is_list: [false, false, false],
      },
    }),
  } as unknown as InstanceType<typeof ComfyUIClient>;
}

const WORKFLOW = {
  "1": { class_type: "CLIPTextEncode", inputs: { text: "original prompt" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "negative" } },
  "3": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512 } },
};

test("get_template does not mutate the parameters it was handed", async () => {
  // `delete params.prompt` enforced "apply once" by mutating the caller's
  // object - which get_template then reports back as appliedParameters, so
  // the response claimed the prompt had not been applied when it had.
  await saveCustomTemplate({
    id: "mutation_probe",
    name: "Mutation probe",
    description: "d",
    workflow: WORKFLOW,
    category: "custom",
    modelType: "any",
    taskType: "txt2img",
  } as Parameters<typeof saveCustomTemplate>[0]);

  const parameters = { prompt: "a cat", width: 1024 };
  const result = await getTemplate(client(), { templateId: "mutation_probe", parameters });

  assert.deepEqual(
    parameters,
    { prompt: "a cat", width: 1024 },
    "the caller's object is untouched"
  );
  assert.deepEqual(
    result.appliedParameters,
    { prompt: "a cat", width: 1024 },
    "and the report names every parameter that was applied"
  );
});

test("the prompt reaches the workflow and only the first text node", async () => {
  await saveCustomTemplate({
    id: "prompt_once",
    name: "Prompt once",
    description: "d",
    workflow: WORKFLOW,
    category: "custom",
    modelType: "any",
    taskType: "txt2img",
  } as Parameters<typeof saveCustomTemplate>[0]);

  const result = await getTemplate(client(), {
    templateId: "prompt_once",
    parameters: { prompt: "a cat", width: 1024 },
  });

  const workflow = result.workflow as typeof WORKFLOW;
  assert.equal(workflow["1"].inputs.text, "a cat", "applied to the first text node");
  assert.equal(workflow["2"].inputs.text, "negative", "the second is left alone");
  assert.equal(workflow["3"].inputs.width, 1024, "other parameters still apply");
});

test("a repeated call from the reported parameters still carries the prompt", async () => {
  // The practical consequence of the mutation: a retry built from the
  // parameters the previous response reported silently dropped the prompt.
  await saveCustomTemplate({
    id: "retry_probe",
    name: "Retry probe",
    description: "d",
    workflow: WORKFLOW,
    category: "custom",
    modelType: "any",
    taskType: "txt2img",
  } as Parameters<typeof saveCustomTemplate>[0]);

  const first = await getTemplate(client(), {
    templateId: "retry_probe",
    parameters: { prompt: "a cat" },
  });
  const second = await getTemplate(client(), {
    templateId: "retry_probe",
    parameters: first.appliedParameters as Record<string, unknown>,
  });

  const workflow = second.workflow as typeof WORKFLOW;
  assert.equal(workflow["1"].inputs.text, "a cat");
});

test("deleting a template that does not exist is a failure, not a success", async () => {
  // These returned {"success":false,...} as a JSON string through
  // textResult, which never sets isError - so the caller could not tell a
  // refused delete from a completed one.
  const { deleteCustomTemplate, TemplateNotFoundError } = await import("./templates.js");

  assert.throws(
    () => deleteCustomTemplate({ id: "no_such_template" }),
    (err: unknown) =>
      err instanceof TemplateNotFoundError && /comfyui_search_templates/.test(err.hint ?? "")
  );
});

test("deleting a built-in names the tool that shows which are custom", async () => {
  const { deleteCustomTemplate, BuiltinTemplateError } = await import("./templates.js");
  const { BUILTIN_TEMPLATES } = await import("../../workflows/builder.js");

  assert.throws(
    () => deleteCustomTemplate({ id: BUILTIN_TEMPLATES[0].id }),
    (err: unknown) =>
      err instanceof BuiltinTemplateError && /comfyui_search_templates/.test(err.hint ?? "")
  );
});

test("a successful delete reports the id it removed", async () => {
  const { saveCustomTemplate, deleteCustomTemplate } = await import("./templates.js");

  saveCustomTemplate({
    id: "to_be_deleted",
    name: "Doomed",
    description: "d",
    workflow: WORKFLOW,
    category: "custom",
    modelType: "any",
    taskType: "txt2img",
  } as Parameters<typeof saveCustomTemplate>[0]);

  const result = deleteCustomTemplate({ id: "to_be_deleted" });

  assert.equal(result.deleted, true);
  assert.equal(result.id, "to_be_deleted");
});

test("save_template returns a structured template, not a JSON string", async () => {
  const { saveCustomTemplate } = await import("./templates.js");

  const result = saveCustomTemplate({
    id: "structured_probe",
    name: "Structured",
    description: "d",
    workflow: WORKFLOW,
    category: "custom",
    modelType: "any",
    taskType: "txt2img",
  } as Parameters<typeof saveCustomTemplate>[0]);

  assert.equal(typeof result, "object");
  assert.equal(result.template.id, "structured_probe");
  assert.match(result.usage, /comfyui_get_template/);
});
