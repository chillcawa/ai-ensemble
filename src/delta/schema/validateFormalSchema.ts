import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { DELTA_FORMAL_SCHEMA_V0_1 } from "./formalSchema";

export interface DeltaFormalSchemaGateResult {
  valid: boolean;
  errors: string[];
}

let compiled: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (!compiled) {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      validateFormats: false,
    });
    compiled = ajv.compile(DELTA_FORMAL_SCHEMA_V0_1);
  }
  return compiled;
}

export function validateDeltaDocumentFormalSchema(
  document: unknown,
): DeltaFormalSchemaGateResult {
  const check = getValidator();
  const ok = Boolean(check(document));
  const details = (check.errors || []) as ErrorObject[];
  return {
    valid: ok,
    errors: ok
      ? []
      : details.map((error) => {
          const path = error.instancePath || "/";
          return `${path}: ${error.message || error.keyword}`;
        }),
  };
}
