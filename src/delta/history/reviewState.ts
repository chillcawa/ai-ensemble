import type { CanonicalDeltaDocument } from "../translator/types";
import type { DeltaPersistedStatus } from "../storage/types";

export interface NewInformationSignal {
  new_response_ids: string[];
  reason: string;
}

/**
 * Existing Resolution is never overwritten automatically.
 * New information only changes the integration/UI status.
 */
export function derivePostResolutionStatus(args: {
  document: CanonicalDeltaDocument;
  newInformation?: NewInformationSignal;
}): DeltaPersistedStatus {
  const hasResolution = args.document.resolutions.length > 0;

  if (!hasResolution) {
    return args.newInformation?.new_response_ids.length ? "new_information" : "ready";
  }

  if (args.newInformation?.new_response_ids.length) {
    return "review_required";
  }

  return "resolved";
}
