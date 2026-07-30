import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import { type AzdoBuild, toBuildSignals } from "./map-builds.js";

/** One watched project, optionally narrowed to pipelines whose name matches `match`. */
export type BuildScopeEntry = {
  project: string;
  /** Regex source, e.g. "^rpa-". Omit to watch every pipeline in the project. */
  match?: string;
};

export type AzdoBuildsConfig = {
  orgUrl: string;
  pat: string;
  scope: readonly BuildScopeEntry[];
};

export function createAzdoBuildsSource(config: AzdoBuildsConfig): SignalSourcePort {
  const org = config.orgUrl.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;

  async function get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!res.ok) throw new Error(`azure devops ${res.status} for ${new URL(url).pathname}`);
    return (await res.json()) as T;
  }

  async function forProject(entry: BuildScopeEntry): Promise<Signal[]> {
    const project = encodeURIComponent(entry.project);
    const defs = await get<{ value?: Array<{ id: number; name: string }> }>(
      `${org}/${project}/_apis/build/definitions?api-version=7.1`,
    );

    const pattern = entry.match === undefined ? undefined : new RegExp(entry.match, "i");
    const wanted = (defs.value ?? []).filter((d) => pattern?.test(d.name) ?? true);
    if (wanted.length === 0) return [];

    // Asking per definition keeps a busy pipeline from crowding the others out of the window.
    const builds = await get<{ value?: AzdoBuild[] }>(
      `${org}/${project}/_apis/build/builds?api-version=7.1` +
        `&definitions=${wanted.map((d) => d.id).join(",")}` +
        `&queryOrder=finishTimeDescending&maxBuildsPerDefinition=6`,
    );

    // The builds endpoint omits `project` on each item, but we know which project we asked for.
    const withProject = (builds.value ?? []).map((b) => ({ ...b, project: { name: entry.project } }));
    return toBuildSignals(withProject, { orgUrl: org });
  }

  return {
    id: "azdo-builds",
    async collect(): Promise<Signal[]> {
      const perProject = await Promise.all(config.scope.map(forProject));
      return perProject.flat();
    },
  };
}

/** Parses AZDO_BUILD_SCOPE. Invalid JSON is fatal — a silent empty scope would look like "all green". */
export function parseBuildScope(raw: string | undefined): BuildScopeEntry[] {
  if (raw === undefined || raw.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("expected an array");
    return parsed as BuildScopeEntry[];
  } catch (cause) {
    throw new Error("AZDO_BUILD_SCOPE is not valid JSON", { cause });
  }
}
