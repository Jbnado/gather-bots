import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import { type AzdoWorkItem, toWorkItemSignals } from "./map-work-items.js";

export type AzdoWorkItemsConfig = {
  orgUrl: string;
  pat: string;
  /** States that count as "on my plate right now". */
  states: readonly string[];
};

/** WIQL has no parameter binding, so state names are quoted defensively. */
function quote(state: string): string {
  return `'${state.replace(/'/g, "''")}'`;
}

export function createAzdoWorkItemsSource(config: AzdoWorkItemsConfig): SignalSourcePort {
  const org = config.orgUrl.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;

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

      const query =
        "SELECT [System.Id] FROM WorkItems" +
        " WHERE [System.AssignedTo] = @Me" +
        ` AND [System.State] IN (${config.states.map(quote).join(",")})` +
        " ORDER BY [System.ChangedDate] DESC";

      const result = await post<{ workItems?: Array<{ id: number }> }>(
        "/_apis/wit/wiql?api-version=7.1",
        { query },
      );
      const ids = (result.workItems ?? []).map((w) => w.id);
      if (ids.length === 0) return [];

      // The batch endpoint caps at 200 ids per call; the filtered set is far below that.
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
