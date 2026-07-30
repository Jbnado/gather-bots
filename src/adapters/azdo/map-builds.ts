import type { Environment, RunState, Signal } from "../../domain/signal.js";

/** Only the fields we depend on. */
export type AzdoBuild = {
  id: number;
  buildNumber?: string;
  /** "completed" | "inProgress" | "notStarted" | "cancelling" | "postponed" */
  status?: string;
  /** "succeeded" | "failed" | "canceled" | "partiallySucceeded" — absent while running. */
  result?: string | undefined;
  sourceBranch: string;
  finishTime?: string | undefined;
  definition: { name: string };
  project: { name: string };
};

/**
 * Only long-lived branches speak for an environment. Feature branches and `refs/pull/*` validation
 * builds are noise here: a red PR build is the author's problem, not the room's.
 */
function environmentOf(branch: string): Environment | undefined {
  if (branch === "refs/heads/main" || branch === "refs/heads/master") return "prod";
  if (branch === "refs/heads/develop") return "develop";
  return undefined;
}

function runStateOf(build: AzdoBuild): RunState | undefined {
  if (build.status === "inProgress" || build.status === "notStarted") return "running";
  if (build.result === "succeeded") return "succeeded";
  if (build.result === "failed" || build.result === "partiallySucceeded") return "failed";
  return undefined;
}

/** Running builds have no finishTime, and are the freshest thing there is. */
function finishedAt(build: AzdoBuild): number {
  return build.finishTime === undefined ? Number.MAX_SAFE_INTEGER : Date.parse(build.finishTime);
}

export function toBuildSignals(
  builds: readonly AzdoBuild[],
  opts: { orgUrl: string },
): Signal[] {
  const org = opts.orgUrl.replace(/\/+$/, "");
  const latest = new Map<string, AzdoBuild>();

  // Only the newest run per pipeline+branch decides anything. Scanning the whole recent window for
  // "any failure" would keep the object red long after a break was fixed.
  for (const build of builds) {
    if (environmentOf(build.sourceBranch) === undefined) continue;

    const key = `${build.project.name}/${build.definition.name}@${build.sourceBranch}`;
    const current = latest.get(key);
    if (current === undefined || finishedAt(build) > finishedAt(current)) {
      latest.set(key, build);
    }
  }

  const signals: Signal[] = [];

  for (const build of latest.values()) {
    const state = runStateOf(build);
    const environment = environmentOf(build.sourceBranch);
    if (state === undefined || environment === undefined) continue;

    signals.push({
      id: `build:${build.project.name}/${build.definition.name}@${environment}`,
      source: "azdo-builds",
      kind: "build",
      title: `${build.definition.name} · ${environment === "prod" ? "main" : "develop"}`,
      url: `${org}/${encodeURIComponent(build.project.name)}/_build/results?buildId=${build.id}`,
      state,
      environment,
    });
  }

  return signals;
}
