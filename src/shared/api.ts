// Shapes returned by the API, shared with the React app.
import type { AgentId, RoomId } from "./registry";
import type { Settings } from "./settings";
import type { AgentStatus, TaskState } from "./tasks";
import type { LevelProgress, QuestStatus } from "./game";

export interface RoomSnapshot {
  id: RoomId;
  unlocked: boolean;
  queued: number;
  working: number;
  needsYou: number;
  blocked: number;
}

export interface AgentSnapshot {
  id: AgentId;
  status: AgentStatus;
  progress: number;
  bubble: string;
  taskTitle: string | null;
  enabled: boolean;
}

export interface HandoffSnapshot {
  id: number;
  from: RoomId;
  to: RoomId;
  productTitle: string;
  createdAt: string;
}

export interface NotificationSnapshot {
  id: number;
  kind: "level" | "achievement" | "sale" | "launch" | "quest" | string;
  title: string;
  body: string | null;
  createdAt: string;
}

export interface Snapshot {
  now: string;
  settings: Settings;
  game: LevelProgress & {
    coinsPence: number;
    monthProfitPence: number;
    questsReady: number;
  };
  rooms: RoomSnapshot[];
  agents: AgentSnapshot[];
  handoffs: HandoffSnapshot[];
  notifications: NotificationSnapshot[];
  approvalsWaiting: number;
  briefingDue: boolean;
  secrets: { sessionSecret: boolean; vaultMasterKey: boolean };
  /** Real AI (Cloudflare Workers AI) is switched on and available. */
  aiReady: boolean;
}

export interface AiStatus {
  available: boolean;
  enabled: boolean;
  usedToday: number;
  cap: number;
  productsLeftToday: number;
  textModel: string;
  imageModel: string;
}

export interface TaskView {
  id: string;
  productId: string | null;
  productTitle: string;
  room: RoomId;
  agent: AgentId | null;
  kind: string;
  title: string;
  state: TaskState;
  progress: number;
  output: Record<string, unknown> | null;
  note: string | null;
  error: string | null;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityView {
  id: number;
  agent: AgentId | null;
  room: RoomId | null;
  kind: string;
  message: string;
  createdAt: string;
}

export interface RoomDetail {
  tasks: TaskView[];
  activity: ActivityView[];
}

export interface LedgerEntry {
  id: string;
  date: string;
  kind: "sale" | "fee" | "cost" | "api" | "refund";
  category: string;
  description: string;
  amountPence: number;
  nonGbp: boolean;
  productId: string | null;
  saleId: string | null;
  demo: boolean;
}

export interface FinanceSummary {
  totals: { salesPence: number; feesPence: number; costsPence: number; apiPence: number; netPence: number };
  monthly: { month: string; salesPence: number; feesPence: number; costsPence: number; netPence: number }[];
  spend: { todayPence: number; monthPence: number; dailyCapPence: number; monthlyCapPence: number };
  taxYear: { label: string; grossPence: number; allowancePence: number };
}

export interface QuestsResponse {
  quests: QuestStatus[];
}

export interface AchievementView {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlockedAt: string | null;
}

export interface Briefing {
  date: string;
  greeting: string;
  yesterday: { sales: number; netPence: number };
  monthProfitPence: number;
  monthlyTargetPence: number;
  approvalsWaiting: number;
  highlights: string[];
  quests: { icon: string; title: string; progress: number; target: number }[];
}
