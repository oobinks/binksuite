// How rooms are named and drawn in the app chrome (the registry keeps the full names).
import type { RoomId } from "../../shared/registry";
import type { IconName } from "../components/Icon";

export const ROOM_ICON: Record<RoomId, IconName> = {
  research: "research",
  studio: "studio",
  mockups: "mockups",
  listing: "listing",
  compliance: "compliance",
  launch: "launch",
  orders: "orders",
  finance: "finance",
  care: "care",
  marketing: "marketing",
  strategy: "strategy",
};

export const ROOM_LABEL: Record<RoomId, string> = {
  research: "Research",
  studio: "Product Studio",
  mockups: "Mockups",
  listing: "Listings",
  compliance: "Compliance",
  launch: "Launch",
  orders: "Orders",
  finance: "Finance",
  care: "Customer Care",
  marketing: "Marketing",
  strategy: "Strategy",
};

/** The product pipeline, in order. */
export const PIPELINE: RoomId[] = ["research", "studio", "mockups", "listing", "compliance", "launch"];
export const BUSINESS: RoomId[] = ["orders", "finance"];
export const LATER: RoomId[] = ["care", "marketing", "strategy"];
