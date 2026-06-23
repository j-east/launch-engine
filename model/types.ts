/**
 * Launch Engine — data model (source of truth)
 *
 * Persisted as JSON now (one file per Concept), but shaped DB-ready:
 * the root holds NORMALIZED child collections (areas, tasks, threads,
 * messages, days, checkins, media). Each array == a future table; every
 * record has a stable `id` and foreign keys (`conceptId`, `areaId`, ...).
 * Moving to Postgres/SQLite later is a mechanical migration, not a redesign.
 */

// ---------- primitives ----------
export type ID = string;            // uuid / nanoid
export type ISODate = string;       // 'YYYY-MM-DD'
export type ISODateTime = string;   // full ISO timestamp

// ---------- enums ----------
export type Stage =
  | 'intake'    // 1 — questions + evidence
  | 'invest'    // 2 — time/money scenarios + decisions
  | 'mindmap'   // 3 — the brain, per-node chats
  | 'schedule'  // 4 — 14-day agenda + budget
  | 'checkin'   // 5 — daily wins/improvements, media, blog
  | 'report';   // 6 — final review

export type Hemisphere = 'left' | 'right';     // left = material build, right = immaterial market
export type Dominance  = 'left' | 'right' | 'balanced';
export type Archetype  = 'builder' | 'operator' | 'marketer' | 'creative';
export type AreaStatus = 'starved' | 'balanced' | 'overfed';  // drives brain glow
export type ProductType = 'digital' | 'physical' | 'service';

/** Area families. LEFT = material build, RIGHT = immaterial market. */
export type Family =
  // left
  | 'product' | 'qa' | 'ops' | 'finance' | 'legal' | 'manufacturing'
  // right
  | 'idea' | 'content' | 'paid' | 'organic' | 'network' | 'traditional' | 'appstore';

// ---------- root ----------
export interface Concept {
  id: ID;
  name: string;
  productType: ProductType;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  currentStage: Stage;

  intake: Intake;
  diagnosis?: Diagnosis;
  budget?: Budget;
  report?: Report;

  // normalized child collections (each ~ a future table)
  areas: Area[];
  tasks: Task[];
  threads: ChatThread[];
  messages: ChatMessage[];
  schedule: ScheduleDay[];
  checkins: CheckIn[];
  media: MediaAsset[];
}

// ---------- Stage 1: intake ----------
export interface Intake {
  what: string;       // "What is your app?"
  problem: string;    // "What problem does it solve?"
  why: string;        // "Why do you feel strongly about this?"
  answers: Record<string, string>;  // extensible follow-up Q&A
  evidence: Evidence; // the signals that let us assess reality vs. optimism
}

/** Evidence-based reality check — the spine of an honest diagnosis. */
export interface Evidence {
  hasBuild: boolean;
  buildMaturity: 'none' | 'prototype' | 'mvp' | 'live';
  landingUrl?: string;
  waitlistCount?: number;
  payingUsers?: number;
  monthlyRevenue?: number;
  customerConversations?: number;   // real convos w/ target users
  daysUntilTargetLaunch?: number;
}

// ---------- Stage 1 output: diagnosis ----------
export interface Diagnosis {
  generatedAt: ISODateTime;
  archetype: Archetype;
  dominance: Dominance;
  balanceScore: number;     // 0..100 (100 = perfectly balanced)
  verdict: string;          // the blunt one-liner shown above the brain
  assessment: string;       // longer honest write-up
  blindSpot: string;        // what they're avoiding
  bluntness: number;        // 0..1 tone dial used to generate copy
  hemispheres: Record<Hemisphere, HemisphereScore>;
}

/** Per-hemisphere rollup. Brain glow/swell = f(effort, need). */
export interface HemisphereScore {
  effort: number;  // 0..100 invested so far (from evidence + checkins)
  need: number;    // 0..100 required at this stage (Claude-assessed)
}

// ---------- Stage 3: mind-map nodes ----------
export interface Area {
  id: ID;
  conceptId: ID;
  hemisphere: Hemisphere;
  family: Family;
  title: string;

  status: AreaStatus;
  effortSpent: number;   // 0..100
  effortNeeded: number;  // 0..100  (priority = effortNeeded - effortSpent)
  materiality: number;   // 0 immaterial .. 1 material (within-hemisphere gradient)

  estTimeHrs: number;
  estMoney: number;

  threadId?: ID;         // the Claude chat scoped to this node

  // broad-in-the-model, focused-on-screen:
  pruned: boolean;
  pruneReason?: string;  // e.g. "skip paid until week-4 retention proven"
}

export interface Task {
  id: ID;
  areaId: ID;
  title: string;
  done: boolean;
  estTimeHrs: number;
  estMoney: number;
  materiality?: number;
}

// ---------- chat (per-node Claude conversations) ----------
export interface ChatThread {
  id: ID;
  conceptId: ID;
  areaId?: ID;           // node-scoped; undefined = global/diagnosis chat
  title: string;
}

export interface ChatMessage {
  id: ID;
  threadId: ID;
  role: 'user' | 'assistant' | 'system';
  content: string;
  at: ISODateTime;
}

// ---------- Stage 2: budgets + optimizer output ----------
export interface Budget {
  timeHrs: number;
  money: number;
  hourlyRate: number;     // values time for blended CPF
  scenario: 'lean' | 'balanced' | 'aggressive' | 'custom';
  variantTest: boolean;   // ad-variant explore→exploit toggle
  allocations: Allocation[];
  projection: Projection;
}

export interface Allocation {
  areaId: ID;
  timeHrs: number;
  money: number;
  expectedLeads: number;
  expectedFounders: number;
  cpf: number;            // cost per paying founder
  funded: boolean;
}

export interface Projection {
  leads: number;
  founders: number;
  blendedCpf: number;
  usedTimeHrs: number;
  usedMoney: number;
  kneeMoney: number;      // diminishing-returns point on the frontier
}

// ---------- Stage 4: schedule ----------
export interface ScheduleDay {
  id: ID;
  conceptId: ID;
  date: ISODate;
  dayIndex: number;       // 1..14
  activities: Activity[];
  budgetPlanned: number;
}

export interface Activity {
  id: ID;
  areaId?: ID;
  taskId?: ID;
  title: string;
  hemisphere: Hemisphere;
  estTimeHrs: number;
  estMoney: number;
  done: boolean;
}

// ---------- Stage 5: daily check-ins ----------
export interface CheckIn {
  id: ID;
  conceptId: ID;
  date: ISODate;
  wins: string;
  improvements: string;
  mediaIds: ID[];
  blogPost?: string;       // auto-generated from the day's progress
  rebalanceNote?: string;  // how this shifted effort/need + the diagnosis
}

export interface MediaAsset {
  id: ID;
  conceptId: ID;
  kind: 'image' | 'video';
  path: string;
  caption?: string;
  at: ISODateTime;
}

// ---------- Stage 6: report ----------
export interface Report {
  generatedAt: ISODateTime;
  summary: string;
  shipped: string[];
  avoided: string[];       // what the founder dodged
  timePlanned: number;
  timeActual: number;
  budgetPlanned: number;
  budgetActual: number;
  outcome: string;         // launch result
  finalBalanceScore: number;
}
