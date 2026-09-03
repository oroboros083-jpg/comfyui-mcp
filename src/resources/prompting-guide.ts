/**
 * Prompting guides for AI image, video and audio generation models.
 *
 * The guides themselves live in `prompting/`, split by model family - there
 * are two dozen of them and they were becoming one unnavigable file. This
 * module stays as the public entry point so every existing import keeps
 * resolving.
 */

export {
  PROMPTING_GUIDES,
  getPromptingGuide,
  getGuideIndex,
  getComprehensiveGuide,
  formatPromptingGuide,
  huggingFaceUrl,
  GUIDE_SECTIONS,
  sectionsPresent,
} from "./prompting/index.js";

export type {
  ModelPromptingGuide,
  PromptingStyle,
  PromptStructure,
  TagSlot,
  SpecialTags,
  StarterPrompt,
  ModelReference,
  GuideSection,
} from "./prompting/index.js";
