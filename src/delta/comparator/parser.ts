import type { ComparatorFragment } from "./types";

export function parseComparatorOutput(raw: string): { fragment: ComparatorFragment; warnings: string[] } {
  const t = raw.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const payload = fenced ? fenced[1] : t;

  let parsed: any;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Delta Comparator: model output is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Delta Comparator: output must be an object");
  for (const key of ["actors", "relations", "unresolved_states", "resolution_candidates"]) {
    if (!Array.isArray(parsed[key])) throw new Error(`Delta Comparator: ${key} must be an array`);
  }

  return {
    fragment: {
      actors: parsed.actors,
      relations: parsed.relations,
      unresolved_states: parsed.unresolved_states,
      resolution_candidates: parsed.resolution_candidates,
    },
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}
