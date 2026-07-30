import { type ActivityItem, truncate } from "../activity.js";
import type { Signal, SignalKind } from "../signal.js";

/** Kinds that are waiting on the human. Everything else belongs on another surface. */
const NEEDS_MY_ACTION: ReadonlySet<SignalKind> = new Set<SignalKind>([
  "review_requested",
  "pr_comment_unanswered",
  "pr_mine_stale",
  "work_item_assigned",
  "calendar_invite_unanswered",
]);

/**
 * Feed entries we send. The badge still reports the true total, so a longer queue
 * spills into a synthetic overflow entry rather than silently disappearing.
 */
const MAX_FEED = 15;

export const OVERFLOW_ID = "overflow";

export type InboxState = {
  count: number;
  activity: ActivityItem[];
};

/** Signals with no `since` sort last — an unknown age is not evidence of urgency. */
function ageKey(signal: Signal): number {
  return signal.since?.getTime() ?? Number.POSITIVE_INFINITY;
}

export function reduceInbox(signals: readonly Signal[]): InboxState {
  const actionable = signals
    .filter((s) => NEEDS_MY_ACTION.has(s.kind))
    .sort((a, b) => ageKey(a) - ageKey(b));

  const activity: ActivityItem[] = actionable.slice(0, MAX_FEED).map((s) => ({
    id: s.id,
    text: truncate(s.title),
    ...(s.url === undefined ? {} : { url: s.url }),
  }));

  const hidden = actionable.length - activity.length;
  if (hidden > 0) {
    activity.push({ id: OVERFLOW_ID, text: `+${hidden} outros` });
  }

  return { count: actionable.length, activity };
}
