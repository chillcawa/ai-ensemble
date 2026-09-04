import type { DeltaIRBundle, DeltaSourceSpan } from "./types";

export interface ParsedTranslatorOutput {
  source_spans: DeltaSourceSpan[];
  bundle: DeltaIRBundle;
  warnings: string[];
}

function stripFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : t;
}

export function parseTranslatorOutput(raw: string): ParsedTranslatorOutput {
  let parsed: any;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    throw new Error("Delta Translator: model output is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Delta Translator: output must be an object");
  if (!Array.isArray(parsed.source_spans)) throw new Error("Delta Translator: source_spans must be an array");
  if (!parsed.bundle || typeof parsed.bundle !== "object") throw new Error("Delta Translator: bundle missing");
  return {
    source_spans: parsed.source_spans,
    bundle: parsed.bundle,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}
