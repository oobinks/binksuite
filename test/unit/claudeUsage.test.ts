import { describe, expect, it } from "vitest";
import { usageFromStreamLine, usagePause } from "../../src/shared/claudeUsage";

// A real report line from `claude -p --output-format stream-json --verbose` (ids removed).
const LINE = JSON.stringify({
  type: "rate_limit_event",
  rate_limit_info: {
    status: "allowed",
    resetsAt: 1792520400,
    rateLimitType: "five_hour",
    overageStatus: "rejected",
    isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.48, resetsAt: 1792520400 }, seven_day: { utilization: 0.67, resetsAt: 1792544400 } },
  },
});

describe("Claude plan usage", () => {
  it("reads both windows from a report line", () => {
    const u = usageFromStreamLine(LINE, new Date("2026-10-20T12:00:00Z"))!;
    expect(u.session).toEqual({ usedPercent: 48, resetsAt: new Date(1792520400 * 1000).toISOString() });
    expect(u.weekly).toEqual({ usedPercent: 67, resetsAt: new Date(1792544400 * 1000).toISOString() });
    expect(u.status).toBe("allowed");
  });

  it("copes with the one-window shape and ignores everything else", () => {
    const one = usageFromStreamLine(JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "seven_day", utilization: 0.91, resetsAt: 1792544400 } }))!;
    expect(one.session).toBeNull();
    expect(one.weekly?.usedPercent).toBe(91);
    expect(usageFromStreamLine('{"type":"assistant"}')).toBeNull();
    expect(usageFromStreamLine("not json")).toBeNull();
    expect(usageFromStreamLine(JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } }))).toBeNull();
  });

  it("pauses automatic starts near a limit, until it resets", () => {
    const at = "2026-10-20T12:00:00Z";
    const resets = "2026-10-20T15:00:00Z";
    const u = { at, status: "allowed_warning", session: { usedPercent: 40, resetsAt: resets }, weekly: { usedPercent: 96, resetsAt: resets } };
    expect(usagePause(u, new Date("2026-10-20T13:00:00Z"))).toEqual({ window: "weekly", resetsAt: resets });
    expect(usagePause(u, new Date("2026-10-20T16:00:00Z"))).toBeNull();
    expect(usagePause({ ...u, weekly: { usedPercent: 60, resetsAt: resets } }, new Date(at))).toBeNull();
  });
});
