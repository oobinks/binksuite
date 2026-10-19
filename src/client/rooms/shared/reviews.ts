import type { RoomId } from "../../../shared/registry";
import type { ReviewDef } from "./types";
import { researchReview } from "../research/Review";
import { studioReview } from "../studio/Review";
import { mockupsReview } from "../mockups/Review";
import { listingReview } from "../listing/Review";
import { complianceReview } from "../compliance/Review";
import { launchReview } from "../launch/Review";
import { printReview } from "../studio/PrintReview";
import { boostersReview } from "../research/BoostersReview";
import { priceWatchReview } from "../listing/PriceWatchReview";
import { sheetReview } from "../studio/SheetReview";

/** Steps that need their own screen, regardless of room. */
export const KIND_REVIEWS: Record<string, ReviewDef> = {
  print_files: printReview,
  brief: boostersReview,
  price_watch: priceWatchReview,
  sheet_build: sheetReview,
};

export const REVIEWS: Partial<Record<RoomId, ReviewDef>> = {
  research: researchReview,
  studio: studioReview,
  mockups: mockupsReview,
  listing: listingReview,
  compliance: complianceReview,
  launch: launchReview,
};
