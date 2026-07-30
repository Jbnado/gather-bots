import type { Signal } from "../../domain/signal.js";

export type AzdoWorkItem = {
  id: number;
  fields: {
    "System.Title": string;
    "System.State": string;
    "System.WorkItemType": string;
    "System.TeamProject": string;
    "System.ChangedDate": string;
  };
};

/**
 * Which states count as "on my plate" is decided by the WIQL query, not here — the org has 31
 * items assigned across seven states, and only a handful are actually being worked. Filtering
 * server-side keeps the payload small; this function just shapes what came back.
 */
export function toWorkItemSignals(
  items: readonly AzdoWorkItem[],
  opts: { orgUrl: string },
): Signal[] {
  const org = opts.orgUrl.replace(/\/+$/, "");

  return items.map((item) => {
    const f = item.fields;
    return {
      id: `wi:${item.id}`,
      source: "azdo-work-items" as const,
      kind: "work_item_assigned" as const,
      title: `${f["System.WorkItemType"]} · ${f["System.State"]} · ${f["System.Title"]}`,
      url: `${org}/${encodeURIComponent(f["System.TeamProject"])}/_workitems/edit/${item.id}`,
      since: new Date(f["System.ChangedDate"]),
    };
  });
}
