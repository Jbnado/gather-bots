import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import { type AzdoWorkItem, toWorkItemSignals } from "./map-work-items.js";
import { buildWorkItemQuery } from "./work-item-query.js";

export type AzdoWorkItemsConfig = {
  orgUrl: string;
  pat: string;
  /** States that count as "on my plate right now". */
  states: readonly string[];
  /**
   * Scopes the query to one team. Required for `currentSprintOnly`, because Azure DevOps refuses
   * `@CurrentIteration` outside a team context.
   */
  team?: { project: string; name: string } | undefined;
  currentSprintOnly?: boolean | undefined;
};

/** `"Project/Team"`. Split on the first slash — Azure DevOps project names cannot contain one. */
export function parseTeam(value: string | undefined): { project: string; name: string } | undefined {
  if (value === undefined || value.trim() === "") return undefined;

  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error(`AZDO_WORK_ITEM_TEAM must look like "Project/Team", got "${value}"`);
  }

  return {
    project: value.slice(0, slash).trim(),
    name: value.slice(slash + 1).trim(),
  };
}

export function createAzdoWorkItemsSource(config: AzdoWorkItemsConfig): SignalSourcePort {
  const org = config.orgUrl.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;

  // Without a team the query runs organisation-wide, which covers every project at once but
  // cannot ask about the current sprint.
  const scope =
    config.team === undefined
      ? ""
      : `/${encodeURIComponent(config.team.project)}/${encodeURIComponent(config.team.name)}`;

  const currentSprintOnly = config.currentSprintOnly === true && config.team !== undefined;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${org}${path}`, {
      method: "POST",
      headers: {
        Authorization: auth,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`azure devops ${res.status} for ${path}`);
    return (await res.json()) as T;
  }

  return {
    id: "azdo-work-items",
    async collect(): Promise<Signal[]> {
      if (config.states.length === 0) return [];

      const query = buildWorkItemQuery({ states: config.states, currentSprintOnly });

      const result = await post<{ workItems?: Array<{ id: number }> }>(
        `${scope}/_apis/wit/wiql?api-version=7.1`,
        { query },
      );
      const ids = (result.workItems ?? []).map((w) => w.id);
      if (ids.length === 0) return [];

      // The batch endpoint caps at 200 ids per call, and is org-level regardless of the scope
      // the query ran under.
      const batch = await post<{ value?: AzdoWorkItem[] }>(
        "/_apis/wit/workitemsbatch?api-version=7.1",
        {
          ids: ids.slice(0, 200),
          fields: [
            "System.Title",
            "System.State",
            "System.WorkItemType",
            "System.TeamProject",
            "System.ChangedDate",
          ],
        },
      );

      return toWorkItemSignals(batch.value ?? [], { orgUrl: org });
    },
  };
}
