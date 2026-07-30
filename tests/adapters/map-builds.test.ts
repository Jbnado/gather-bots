import { describe, expect, test } from "vitest";
import { type AzdoBuild, toBuildSignals } from "../../src/adapters/azdo/map-builds.js";

const ORG = "https://dev.azure.com/contoso";

function build(overrides: Partial<AzdoBuild> = {}): AzdoBuild {
  return {
    id: 1,
    buildNumber: "1",
    status: "completed",
    result: "succeeded",
    sourceBranch: "refs/heads/main",
    finishTime: "2026-07-30T10:00:00Z",
    definition: { name: "svc-orders" },
    project: { name: "Automação de Dados" },
    ...overrides,
  };
}

describe("toBuildSignals", () => {
  test("marks a main branch build as prod", () => {
    const [signal] = toBuildSignals([build({ result: "failed" })], { orgUrl: ORG });

    expect(signal?.environment).toBe("prod");
    expect(signal?.state).toBe("failed");
  });

  test("marks a develop branch build as develop", () => {
    const [signal] = toBuildSignals(
      [build({ sourceBranch: "refs/heads/develop", result: "failed" })],
      { orgUrl: ORG },
    );

    expect(signal?.environment).toBe("develop");
  });

  // PR validation builds say nothing about the health of an environment.
  test("ignores pull request validation builds", () => {
    const pr = build({ sourceBranch: "refs/pull/101/merge", result: "failed" });

    expect(toBuildSignals([pr], { orgUrl: ORG })).toEqual([]);
  });

  test("ignores builds from other branches", () => {
    const feature = build({ sourceBranch: "refs/heads/feature/x", result: "failed" });

    expect(toBuildSignals([feature], { orgUrl: ORG })).toEqual([]);
  });

  // The decisive case: an old failure that has since been fixed must not keep the object red.
  test("keeps only the latest build per pipeline and branch", () => {
    const signals = toBuildSignals(
      [
        build({ id: 10, result: "failed", finishTime: "2026-07-30T08:00:00Z" }),
        build({ id: 11, result: "succeeded", finishTime: "2026-07-30T09:00:00Z" }),
      ],
      { orgUrl: ORG },
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.state).toBe("succeeded");
  });

  test("treats the same pipeline on two branches as two signals", () => {
    const signals = toBuildSignals(
      [
        build({ id: 10, sourceBranch: "refs/heads/main" }),
        build({ id: 11, sourceBranch: "refs/heads/develop" }),
      ],
      { orgUrl: ORG },
    );

    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.environment).sort()).toEqual(["develop", "prod"]);
  });

  test("reports an in-progress build as running", () => {
    const [signal] = toBuildSignals(
      [build({ status: "inProgress", result: undefined, finishTime: undefined })],
      { orgUrl: ORG },
    );

    expect(signal?.state).toBe("running");
  });

  test("builds a browser URL for the build results page", () => {
    const [signal] = toBuildSignals([build({ id: 4242, result: "failed" })], { orgUrl: ORG });

    expect(signal?.url).toBe(
      "https://dev.azure.com/contoso/Automa%C3%A7%C3%A3o%20de%20Dados/_build/results?buildId=4242",
    );
  });
});
