import { describe, expect, it } from "vitest";
import { nextState, canTransition, InvalidTransition } from "../../src/shared/tasks";

describe("task state machine", () => {
  it("walks the happy path", () => {
    let s = nextState("queued", "claim");
    expect(s).toBe("working");
    s = nextState(s, "finish");
    expect(s).toBe("needs_approval");
    expect(nextState(s, "approve")).toBe("done");
  });
  it("auto-finishes steps that don't need approval", () => {
    expect(nextState("working", "finish_auto")).toBe("done");
  });
  it("retries on error until out of attempts", () => {
    expect(nextState("working", "error", { attempts: 1, maxAttempts: 3 })).toBe("queued");
    expect(nextState("working", "error", { attempts: 3, maxAttempts: 3 })).toBe("failed");
    expect(nextState("failed", "retry")).toBe("queued");
  });
  it("sends rejected work back to the queue, or to an earlier step", () => {
    expect(nextState("needs_approval", "reject")).toBe("queued");
    expect(nextState("needs_approval", "send_back")).toBe("done");
  });
  it("blocks on spend caps and unblocks", () => {
    expect(nextState("queued", "block")).toBe("blocked");
    expect(nextState("blocked", "unblock")).toBe("queued");
  });
  it("refuses illegal moves", () => {
    expect(() => nextState("done", "approve")).toThrow(InvalidTransition);
    expect(() => nextState("queued", "approve")).toThrow(/Can't approve a task that is queued/);
    expect(canTransition("working", "approve")).toBe(false);
  });
});
