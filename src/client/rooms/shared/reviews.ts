import type { RoomId } from "../../../shared/registry";
import type { ReviewDef } from "./types";
import { researchReview } from "../research/Review";
import { studioReview } from "../studio/Review";
import { mockupsReview } from "../mockups/Review";
import { listingReview } from "../listing/Review";
import { complianceReview } from "../compliance/Review";
import { launchReview } from "../launch/Review";

export const REVIEWS: Partial<Record<RoomId, ReviewDef>> = {
  research: researchReview,
  studio: studioReview,
  mockups: mockupsReview,
  listing: listingReview,
  compliance: complianceReview,
  launch: launchReview,
};
