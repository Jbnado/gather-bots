/** Where a signal came from. Surfaces never branch on this — it exists for feed ids and debugging. */
export type SourceId = "azdo-prs" | "azdo-builds" | "azdo-work-items" | "gcal" | "outlook";

/**
 * The semantic fact a source reports. Sources never decide which object a signal lands on;
 * that routing is a presentation decision and lives in the surface reducers.
 */
export type SignalKind =
  | "review_requested"
  | "pr_comment_unanswered"
  | "pr_mine_stale"
  | "work_item_assigned"
  | "calendar_invite_unanswered"
  | "calendar_event"
  | "build"
  | "release";

export type RunState = "running" | "succeeded" | "failed";

/**
 * Which environment a build speaks for. A fact about the branch, not a presentation choice —
 * surfaces decide that prod failing is louder than develop failing.
 */
export type Environment = "prod" | "develop";

export type Signal = {
  /** Namespaced so sources sharing one object never collide: "pr:8821", "gcal:evt_abc". */
  id: string;
  source: SourceId;
  kind: SignalKind;
  title: string;
  url?: string;
  /** When the underlying thing appeared — drives "stuck for 2 days" and feed ordering. */
  since?: Date;
  /** Events with a time range. */
  window?: { start: Date; end: Date };
  state?: RunState;
  environment?: Environment;
};
