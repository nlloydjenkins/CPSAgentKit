// Prompt-config utilities for the Dataverse `msdyn_aiconfiguration` table.
//
// Prompt tool instructions live in `msdyn_customconfiguration` as a JSON blob
// with these top-level keys (subject to platform evolution):
//
//   {
//     "prompt":          [{ "role": "system" | "user", "content": "..." }, ...]
//     "code":            string | object         // generated, do not edit
//     "definitions":     object                  // input/output schema
//     "modelParameters": object                  // model, temperature, etc.
//     "settings":        object
//     "signature":       string                  // platform-generated
//   }
//
// These helpers parse, transform, and re-emit that blob so callers can update
// the prompt segments while preserving every other key byte-equivalently.
//
// They are pure functions over JSON strings. No I/O, no Dataverse calls. Both
// the MCP tools (driven by the user's existing Dataverse MCP session) and the
// optional `scripts/prompt-sync.mjs` (service-principal auth) reuse them.

export interface PromptSegment {
  role: string;
  content: string;
}

export interface PromptConfig {
  /** The parsed top-level object. */
  raw: Record<string, unknown>;
  /** Ordered list of prompt segments (role + content). */
  prompts: PromptSegment[];
  /** Set of `{{...}}` placeholders extracted from all segment contents. */
  placeholders: string[];
  /** Top-level keys present (e.g. ['prompt','code','definitions',...]). */
  keys: string[];
}

export interface BuildPromptUpdateInput {
  /** The existing `msdyn_customconfiguration` value, exactly as read from Dataverse. */
  originalCustomConfiguration: string;
  /**
   * The new prompt segments to write. Must have the same length and same
   * `role` order as the existing segments unless `allowSegmentShapeChange`
   * is true.
   */
  newPrompts: PromptSegment[];
  /**
   * If true, accept changes to the segment count or roles. Defaults to false
   * — most edits should only change `content`, not the segment shape.
   */
  allowSegmentShapeChange?: boolean;
  /**
   * If true, accept changes to the `{{...}}` placeholder set. Defaults to
   * false — placeholders are bound to input-parameter names; changing them
   * silently breaks the tool.
   */
  allowPlaceholderChange?: boolean;
}

export interface PromptUpdateValidation {
  ok: boolean;
  /** Hard errors that would corrupt the record. */
  errors: string[];
  /** Soft warnings — review before pushing. */
  warnings: string[];
  /** Placeholders only in the original. */
  placeholdersRemoved: string[];
  /** Placeholders only in the proposed update. */
  placeholdersAdded: string[];
  /** Top-level keys removed (must always be empty for a safe write). */
  keysRemoved: string[];
  /** Top-level keys added (must always be empty for a safe write). */
  keysAdded: string[];
  segmentCountBefore: number;
  segmentCountAfter: number;
}

export interface PromptUpdateResult {
  validation: PromptUpdateValidation;
  /**
   * The new `msdyn_customconfiguration` JSON string ready to PATCH back to
   * Dataverse, with only the prompt segment contents updated. Undefined when
   * `validation.ok` is false (so callers cannot accidentally write a bad
   * payload).
   */
  newCustomConfiguration?: string;
}

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Extract the unique, sorted set of `{{...}}` placeholder names. */
export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
    found.add(match[1]);
  }
  return [...found].sort();
}

function asPromptSegments(value: unknown): PromptSegment[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "msdyn_customconfiguration.prompt is not an array — record may be malformed or the schema has changed.",
    );
  }
  return value.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as { role?: unknown }).role !== "string" ||
      typeof (entry as { content?: unknown }).content !== "string"
    ) {
      throw new Error(
        `msdyn_customconfiguration.prompt[${index}] is missing string \`role\` or \`content\`.`,
      );
    }
    const seg = entry as Record<string, unknown>;
    return {
      role: seg.role as string,
      content: seg.content as string,
    };
  });
}

/**
 * Parse a `msdyn_customconfiguration` JSON string. Throws if the string is
 * not valid JSON or does not contain a `prompt` array.
 */
export function parsePromptConfig(customConfiguration: string): PromptConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(customConfiguration);
  } catch (err) {
    throw new Error(
      `msdyn_customconfiguration is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      "msdyn_customconfiguration must be a JSON object at the top level.",
    );
  }
  const obj = raw as Record<string, unknown>;
  const prompts = asPromptSegments(obj.prompt);
  const allText = prompts.map((p) => p.content).join("\n");
  return {
    raw: obj,
    prompts,
    placeholders: extractPlaceholders(allText),
    keys: Object.keys(obj),
  };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function diff(before: readonly string[], after: readonly string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    removed: before.filter((x) => !afterSet.has(x)),
    added: after.filter((x) => !beforeSet.has(x)),
  };
}

/**
 * Produce a new `msdyn_customconfiguration` string with prompt-segment
 * contents replaced by `newPrompts`. Every other top-level key (`code`,
 * `definitions`, `modelParameters`, `settings`, `signature`, ...) is
 * preserved exactly as-read.
 *
 * If validation fails, `newCustomConfiguration` is undefined — callers
 * cannot accidentally PATCH a payload that drops keys, changes segment
 * shape, or alters the `{{placeholder}}` set.
 */
export function buildPromptUpdate(
  input: BuildPromptUpdateInput,
): PromptUpdateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const before = parsePromptConfig(input.originalCustomConfiguration);
  const beforePlaceholders = before.placeholders;

  // Validate segment shape.
  if (
    !input.allowSegmentShapeChange &&
    before.prompts.length !== input.newPrompts.length
  ) {
    errors.push(
      `Prompt segment count changed (was ${before.prompts.length}, now ${input.newPrompts.length}). Pass allowSegmentShapeChange=true if intentional.`,
    );
  }
  const minLen = Math.min(before.prompts.length, input.newPrompts.length);
  if (!input.allowSegmentShapeChange) {
    for (let i = 0; i < minLen; i += 1) {
      const oldRole = before.prompts[i].role;
      const newRole = input.newPrompts[i].role;
      if (oldRole !== newRole) {
        errors.push(
          `Prompt segment [${i}] role changed (was "${oldRole}", now "${newRole}"). Pass allowSegmentShapeChange=true if intentional.`,
        );
      }
    }
  }

  // Build the proposed object.
  const next: Record<string, unknown> = { ...before.raw };
  next.prompt = input.newPrompts.map((p) => ({
    role: p.role,
    content: p.content,
  }));

  // Validate placeholder set.
  const afterText = input.newPrompts.map((p) => p.content).join("\n");
  const afterPlaceholders = extractPlaceholders(afterText);
  const phDiff = diff(beforePlaceholders, afterPlaceholders);
  if (
    !input.allowPlaceholderChange &&
    !arraysEqual(beforePlaceholders, afterPlaceholders)
  ) {
    errors.push(
      `Placeholder set changed. Removed: [${phDiff.removed.join(", ") || "(none)"}]. Added: [${phDiff.added.join(", ") || "(none)"}]. Pass allowPlaceholderChange=true if intentional (this typically requires a matching change to the prompt tool's input definitions in the portal).`,
    );
  } else if (
    input.allowPlaceholderChange &&
    (phDiff.removed.length > 0 || phDiff.added.length > 0)
  ) {
    warnings.push(
      `Placeholder set changed. Ensure the prompt tool's input definitions in the portal still match: removed [${phDiff.removed.join(", ") || "(none)"}], added [${phDiff.added.join(", ") || "(none)"}].`,
    );
  }

  // Validate top-level keys are unchanged.
  const afterKeys = Object.keys(next);
  const keyDiff = diff(before.keys, afterKeys);
  if (keyDiff.removed.length > 0) {
    errors.push(
      `Top-level keys removed from msdyn_customconfiguration: [${keyDiff.removed.join(", ")}]. This would corrupt the prompt tool — refusing.`,
    );
  }
  if (keyDiff.added.length > 0) {
    errors.push(
      `Top-level keys added to msdyn_customconfiguration: [${keyDiff.added.join(", ")}]. New top-level keys must be added in the portal — refusing.`,
    );
  }

  const validation: PromptUpdateValidation = {
    ok: errors.length === 0,
    errors,
    warnings,
    placeholdersRemoved: phDiff.removed,
    placeholdersAdded: phDiff.added,
    keysRemoved: keyDiff.removed,
    keysAdded: keyDiff.added,
    segmentCountBefore: before.prompts.length,
    segmentCountAfter: input.newPrompts.length,
  };

  if (!validation.ok) {
    return { validation };
  }

  return {
    validation,
    newCustomConfiguration: JSON.stringify(next),
  };
}
