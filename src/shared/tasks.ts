// Task state machine. The engine refuses any transition not listed here.
//
//   queued ──claim──▶ working ──finish──────▶ needs_approval ──approve────▶ done
//    │  ▲               │ │  └─finish_auto─▶ done      │ ├──reject─────▶ queued (redo, with note)
//    │  │               │ └─error─▶ queued (retry)      │ ├──send_back──▶ done (an earlier step redoes it)
//    │  │               │          or failed (no tries) │ └──discard────▶ failed
//    │  └──unblock── blocked ◀── cap hit                 │
//    └──cap hit──────▶ blocked                    failed ──retry──▶ queued

export type TaskState = "queued" | "working" | "needs_approval" | "done" | "failed" | "blocked";

export type TaskEvent =
  | "claim"
  | "progress"
  | "finish"
  | "finish_auto"
  | "error"
  | "approve"
  | "reject"
  | "send_back"
  | "discard"
  | "retry"
  | "block"
  | "unblock";

const TABLE: Record<TaskState, Partial<Record<TaskEvent, TaskState | ((t: RetryInfo) => TaskState)>>> = {
  queued: { claim: "working", block: "blocked", discard: "failed" },
  working: {
    progress: "working",
    finish: "needs_approval",
    finish_auto: "done",
    error: (t) => (t.attempts < t.maxAttempts ? "queued" : "failed"),
    block: "blocked",
  },
  needs_approval: { approve: "done", reject: "queued", send_back: "done", discard: "failed" },
  blocked: { unblock: "queued", discard: "failed" },
  failed: { retry: "queued" },
  done: {},
};

export interface RetryInfo {
  attempts: number;
  maxAttempts: number;
}

export class InvalidTransition extends Error {
  constructor(
    public from: TaskState,
    public event: TaskEvent,
  ) {
    super(`Can't ${event} a task that is ${from}`);
  }
}

export function nextState(from: TaskState, event: TaskEvent, retry: RetryInfo = { attempts: 0, maxAttempts: 3 }): TaskState {
  const to = TABLE[from][event];
  if (to === undefined) throw new InvalidTransition(from, event);
  return typeof to === "function" ? to(retry) : to;
}

export function canTransition(from: TaskState, event: TaskEvent): boolean {
  return TABLE[from][event] !== undefined;
}

export type AgentStatus = "idle" | "working" | "needs_you" | "blocked" | "done" | "off";

export const STATUS_EMOJI: Record<AgentStatus, string> = {
  idle: "💤",
  working: "⚙️",
  needs_you: "❗",
  blocked: "⛔",
  done: "✅",
  off: "🌙",
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  working: "Working",
  needs_you: "Needs you",
  blocked: "Blocked",
  done: "Just finished",
  off: "Off duty",
};
