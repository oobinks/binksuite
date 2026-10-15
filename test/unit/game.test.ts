import { describe, expect, it } from "vitest";
import {
  levelForXp,
  xpForLevel,
  levelProgress,
  isRoomUnlocked,
  unlocksAtLevel,
  questStatuses,
  periodStart,
  periodKey,
  earnedAchievements,
  ukTaxYear,
  QUESTS,
} from "../../src/shared/game";
import { ROOMS, AGENTS } from "../../src/shared/registry";

describe("levels", () => {
  it("follows the ladder", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(499)).toBe(3);
    expect(levelForXp(500)).toBe(4);
    expect(levelForXp(2000)).toBe(7);
    expect(levelForXp(2700)).toBe(8);
  });
  it("round-trips thresholds", () => {
    for (let l = 1; l < 12; l++) expect(levelForXp(xpForLevel(l))).toBe(l);
  });
  it("reports progress within a level", () => {
    const p = levelProgress(400);
    expect(p.level).toBe(3);
    expect(p.nextLevelXp).toBe(500);
    expect(p.progress).toBeCloseTo(0.6);
  });
});

describe("unlocks", () => {
  it("matches the plan's ladder", () => {
    expect(ROOMS.filter((r) => r.unlockLevel === 1).map((r) => r.id).sort()).toEqual(["finance", "listing", "research", "studio"]);
    expect(isRoomUnlocked("compliance", 1)).toBe(false);
    expect(isRoomUnlocked("compliance", 2)).toBe(true);
    expect(isRoomUnlocked("mockups", 3)).toBe(true);
    expect(isRoomUnlocked("launch", 3)).toBe(false);
    expect(isRoomUnlocked("launch", 4)).toBe(true);
    expect(isRoomUnlocked("orders", 5)).toBe(true);
    expect(isRoomUnlocked("care", 5)).toBe(true);
    expect(isRoomUnlocked("marketing", 6)).toBe(true);
    expect(isRoomUnlocked("strategy", 6)).toBe(false);
    expect(unlocksAtLevel(1)).toContain("⚙️ Settings");
  });
  it("has 11 map rooms and 13 agents, each in a real room", () => {
    expect(ROOMS).toHaveLength(11);
    expect(AGENTS).toHaveLength(13);
    for (const a of AGENTS) expect(ROOMS.some((r) => r.id === a.room)).toBe(true);
  });
});

describe("quests", () => {
  it("shows campaign quests one at a time", () => {
    const s = questStatuses({}, new Set());
    const campaign = s.filter((q) => q.quest.kind === "campaign");
    expect(campaign.filter((q) => q.visible)).toHaveLength(1);
    const after = questStatuses({ "c1-clock-in": 1 }, new Set(["c1-clock-in"]));
    expect(after.filter((q) => q.quest.kind === "campaign" && q.visible).map((q) => q.quest.id)).toEqual(["c1-clock-in", "c2-tour"]);
  });
  it("caps progress at the target and marks completion", () => {
    const s = questStatuses({ "d-approve3": 7 }, new Set());
    const q = s.find((x) => x.quest.id === "d-approve3")!;
    expect(q.progress).toBe(3);
    expect(q.complete).toBe(true);
  });
  it("uses Monday-start weeks and UTC days", () => {
    const wed = new Date("2026-10-14T15:00:00Z");
    expect(periodStart("daily", wed)).toBe("2026-10-14T00:00:00.000Z");
    expect(periodStart("weekly", wed)).toBe("2026-10-12T00:00:00.000Z");
    expect(periodKey("campaign", wed)).toBe("campaign");
    const sun = new Date("2026-10-18T23:00:00Z");
    expect(periodStart("weekly", sun)).toBe("2026-10-12T00:00:00.000Z");
  });
  it("has unique ids", () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });
});

describe("achievements", () => {
  it("unlocks from stats", () => {
    const got = earnedAchievements({ approvals: 1, launches: 0, sales: 1, level: 4, profitPence: 0, questsClaimed: 0 });
    expect(got).toEqual(expect.arrayContaining(["first-approval", "first-sale", "level-4"]));
    expect(got).not.toContain("first-launch");
  });
});

describe("UK tax year", () => {
  it("runs 6 April to 5 April", () => {
    expect(ukTaxYear(new Date("2026-04-05T12:00:00Z")).label).toBe("2025/26");
    expect(ukTaxYear(new Date("2026-04-06T00:00:00Z")).label).toBe("2026/27");
    expect(ukTaxYear(new Date("2026-10-15T00:00:00Z")).start).toBe("2026-04-06T00:00:00.000Z");
  });
});
