/** Wire limit on `activity.text`. */
const MAX_TEXT = 500;

/** One entry in an object's activity feed. */
export type ActivityItem = {
  id: string;
  text: string;
  url?: string;
};

export function truncate(text: string): string {
  return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;
}
