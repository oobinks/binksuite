// The single source of truth for rooms and agents.
// Adding a room or agent = one entry here, one folder in src/client/rooms/,
// and (for working agents) one handler in src/worker/engine/agents/.

export type RoomId =
  | "research"
  | "studio"
  | "mockups"
  | "listing"
  | "compliance"
  | "launch"
  | "finance"
  | "orders"
  | "care"
  | "marketing"
  | "strategy";

export type AgentId =
  | "scout"
  | "analyst"
  | "designer"
  | "inspector"
  | "printer"
  | "stylist"
  | "copywriter"
  | "pricer"
  | "warden"
  | "crafter"
  | "concierge"
  | "promoter"
  | "manager";

export interface RoomDef {
  id: RoomId;
  name: string;
  icon: string;
  /** Tailwind-free hex so the map, SVGs and charts can all use it. */
  color: string;
  floor: string;
  /** Build phase in which the room does real work. */
  phase: number;
  /** In Phase 1, pipeline rooms run demo tasks so the engine is exercised. */
  demoInteractive: boolean;
  blurb: string;
  furniture: string[];
  /** Position on the HQ floor plan, in % of the map. */
  map: { x: number; y: number; w: number; h: number };
}

export interface AvatarLook {
  skin: string;
  hair: string;
  hairStyle: "bob" | "spiky" | "bun" | "curly" | "bald" | "long" | "cap" | "beret";
  shirt: string;
  accessory?: "glasses" | "headset" | "monocle" | "scarf" | "bowtie" | "badge";
  prop: string;
}

export interface AgentDef {
  id: AgentId;
  name: string;
  role: string;
  room: RoomId;
  look: AvatarLook;
  idleLines: string[];
  workLines: string[];
}

export const ROOMS: RoomDef[] = [
  {
    id: "research",
    name: "Research Lab",
    icon: "🔬",
    color: "#7c9cf5",
    floor: "#e6ecff",
    phase: 2,
    demoInteractive: true,
    blurb: "Scout and Analyst hunt for niches worth making.",
    furniture: ["⚗️", "📚", "🔭"],
    map: { x: 1, y: 2, w: 23.5, h: 33 },
  },
  {
    id: "studio",
    name: "Product Studio",
    icon: "🎨",
    color: "#f28fb5",
    floor: "#ffe8f1",
    phase: 2,
    demoInteractive: true,
    blurb: "Designer, Inspector and Printer turn briefs into print files.",
    furniture: ["🖌️", "🖨️", "🌿"],
    map: { x: 25.5, y: 2, w: 23.5, h: 33 },
  },
  {
    id: "mockups",
    name: "Mockup Studio",
    icon: "🖼️",
    color: "#b48cf2",
    floor: "#f1e8ff",
    phase: 3,
    demoInteractive: true,
    blurb: "Stylist stages your prints in frames, desks and tablets.",
    furniture: ["🖼️", "💡", "🛋️"],
    map: { x: 50, y: 2, w: 23.5, h: 33 },
  },
  {
    id: "listing",
    name: "Listing Office",
    icon: "✍️",
    color: "#f2b35b",
    floor: "#fff1dc",
    phase: 3,
    demoInteractive: true,
    blurb: "Copywriter and Pricer write titles, tags and prices.",
    furniture: ["⌨️", "☕", "🗂️"],
    map: { x: 74.5, y: 2, w: 24.5, h: 33 },
  },
  {
    id: "compliance",
    name: "Compliance Office",
    icon: "🛡️",
    color: "#5bbf9a",
    floor: "#e0f6ec",
    phase: 3,
    demoInteractive: true,
    blurb: "Warden checks every listing against the rules before launch.",
    furniture: ["📋", "⚖️", "🗄️"],
    map: { x: 74.5, y: 43, w: 24.5, h: 26 },
  },
  {
    id: "launch",
    name: "Launch Pad",
    icon: "🚀",
    color: "#f27a6b",
    floor: "#ffe5e1",
    phase: 3,
    demoInteractive: true,
    blurb: "Your copy-paste pack for Etsy. You press the big button.",
    furniture: ["🚀", "📦", "🎛️"],
    map: { x: 50, y: 43, w: 23.5, h: 26 },
  },
  {
    id: "orders",
    name: "Orders Desk",
    icon: "📦",
    color: "#c9a26b",
    floor: "#f6ecdc",
    phase: 4,
    demoInteractive: false,
    blurb: "Your real Etsy orders land here. Crafter flags buyers' notes.",
    furniture: ["📦", "🏷️", "✂️"],
    map: { x: 25.5, y: 43, w: 23.5, h: 26 },
  },
  {
    id: "finance",
    name: "Finance Vault",
    icon: "💷",
    color: "#e0b83a",
    floor: "#fff7d6",
    phase: 1,
    demoInteractive: false,
    blurb: "Real money: fees, profit, caps and your trading allowance.",
    furniture: ["💰", "🔢", "🔐"],
    map: { x: 1, y: 43, w: 23.5, h: 26 },
  },
  {
    id: "care",
    name: "Customer Care",
    icon: "💬",
    color: "#6bc4d9",
    floor: "#e0f5fa",
    phase: 5,
    demoInteractive: false,
    blurb: "Concierge drafts kind replies. You always press send.",
    furniture: ["💌", "☕", "🎧"],
    map: { x: 1, y: 73, w: 32, h: 25 },
  },
  {
    id: "marketing",
    name: "Marketing Studio",
    icon: "📣",
    color: "#e88ad6",
    floor: "#fbe6f7",
    phase: 5,
    demoInteractive: false,
    blurb: "Promoter plans pins, posts and a content calendar.",
    furniture: ["📌", "📸", "🗓️"],
    map: { x: 34, y: 73, w: 32, h: 25 },
  },
  {
    id: "strategy",
    name: "Strategy HQ",
    icon: "📊",
    color: "#8a8fd9",
    floor: "#e9eafc",
    phase: 5,
    demoInteractive: false,
    blurb: "Manager writes the weekly report and suggests quests.",
    furniture: ["📊", "🗺️", "🏆"],
    map: { x: 67, y: 73, w: 32, h: 25 },
  },
];

export const AGENTS: AgentDef[] = [
  {
    id: "scout",
    name: "Scout",
    role: "Niche hunter",
    room: "research",
    look: { skin: "#f1c27d", hair: "#6b3e26", hairStyle: "cap", shirt: "#7c9cf5", prop: "🔎" },
    idleLines: ["Any niches today?", "Sniffing out trends…"],
    workLines: ["Scoring this niche…", "Checking demand…", "Counting competitors…"],
  },
  {
    id: "analyst",
    name: "Analyst",
    role: "Competitor reader",
    room: "research",
    look: { skin: "#8d5524", hair: "#1b1b1b", hairStyle: "bun", shirt: "#4f6fd6", accessory: "glasses", prop: "📈" },
    idleLines: ["Spreadsheets are cosy.", "Ready to rank."],
    workLines: ["Writing the brief…", "Ranking the board…"],
  },
  {
    id: "designer",
    name: "Designer",
    role: "Prompt artist",
    room: "studio",
    look: { skin: "#ffdbac", hair: "#e05f8f", hairStyle: "beret", shirt: "#f28fb5", accessory: "scarf", prop: "🖌️" },
    idleLines: ["Sketching ideas…", "Need a brief!"],
    workLines: ["Mixing prompts…", "Generating art…", "Trying a new palette…"],
  },
  {
    id: "inspector",
    name: "Inspector",
    role: "Quality checker",
    room: "studio",
    look: { skin: "#c68642", hair: "#3b2a20", hairStyle: "bald", shirt: "#d9668f", accessory: "monocle", prop: "🔍" },
    idleLines: ["Hmm.", "Nothing to inspect."],
    workLines: ["Counting fingers…", "Checking for garbled text…", "Zooming in…"],
  },
  {
    id: "printer",
    name: "Printer",
    role: "Print-file maker",
    room: "studio",
    look: { skin: "#e0ac69", hair: "#a0522d", hairStyle: "curly", shirt: "#c74f7c", accessory: "headset", prop: "🖨️" },
    idleLines: ["Paper's loaded.", "Toner's warm."],
    workLines: ["Sizing A4, A3, A5…", "Zipping files…"],
  },
  {
    id: "stylist",
    name: "Stylist",
    role: "Mockup maker",
    room: "mockups",
    look: { skin: "#ffe0bd", hair: "#f2d16b", hairStyle: "long", shirt: "#b48cf2", accessory: "bowtie", prop: "🖼️" },
    idleLines: ["Fluffing cushions.", "Ready for a photoshoot."],
    workLines: ["Framing your print…", "Arranging the desk…"],
  },
  {
    id: "copywriter",
    name: "Copywriter",
    role: "Titles, tags, words",
    room: "listing",
    look: { skin: "#f1c27d", hair: "#2e2e2e", hairStyle: "spiky", shirt: "#f2b35b", accessory: "glasses", prop: "✍️" },
    idleLines: ["Sharpening pencils.", "Words, words, words."],
    workLines: ["Polishing the title…", "Picking 13 tags…"],
  },
  {
    id: "pricer",
    name: "Pricer",
    role: "Profit protector",
    room: "listing",
    look: { skin: "#8d5524", hair: "#d4d4d4", hairStyle: "bob", shirt: "#d9962f", accessory: "badge", prop: "🔢" },
    idleLines: ["Every penny counts.", "Fees checked."],
    workLines: ["Running the fee maths…", "Finding the sweet spot…"],
  },
  {
    id: "warden",
    name: "Warden",
    role: "Rules keeper",
    room: "compliance",
    look: { skin: "#e0ac69", hair: "#4a3728", hairStyle: "cap", shirt: "#5bbf9a", accessory: "badge", prop: "📋" },
    idleLines: ["All quiet.", "Rules are rules."],
    workLines: ["Checking AI disclosure…", "Scanning the blocklist…"],
  },
  {
    id: "crafter",
    name: "Crafter",
    role: "Personalised orders",
    room: "orders",
    look: { skin: "#ffdbac", hair: "#8b5a2b", hairStyle: "curly", shirt: "#c9a26b", accessory: "scarf", prop: "✂️" },
    idleLines: ["Waiting for orders.", "Phase 4, here I come!"],
    workLines: ["Personalising…"],
  },
  {
    id: "concierge",
    name: "Concierge",
    role: "Customer replies",
    room: "care",
    look: { skin: "#c68642", hair: "#2b1b10", hairStyle: "long", shirt: "#6bc4d9", accessory: "headset", prop: "💌" },
    idleLines: ["Kettle's on.", "Coming in Phase 5."],
    workLines: ["Drafting a reply…"],
  },
  {
    id: "promoter",
    name: "Promoter",
    role: "Pins and posts",
    room: "marketing",
    look: { skin: "#f1c27d", hair: "#c2185b", hairStyle: "spiky", shirt: "#e88ad6", accessory: "glasses", prop: "📣" },
    idleLines: ["Pin it to win it.", "Coming in Phase 5."],
    workLines: ["Designing a pin…"],
  },
  {
    id: "manager",
    name: "Manager",
    role: "Weekly strategy",
    room: "strategy",
    look: { skin: "#ffe0bd", hair: "#5a5a5a", hairStyle: "bob", shirt: "#8a8fd9", accessory: "bowtie", prop: "📊" },
    idleLines: ["Big picture time.", "Coming in Phase 5."],
    workLines: ["Writing the weekly report…"],
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, RoomDef>;
export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>;

export function agentsInRoom(room: RoomId): AgentDef[] {
  return AGENTS.filter((a) => a.room === room);
}

/** The product pipeline, in order. Parcels travel along it. */
export const PIPELINE: RoomId[] = ["research", "studio", "mockups", "listing", "compliance", "launch"];
