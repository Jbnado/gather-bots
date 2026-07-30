import { describe, expect, test } from "vitest";
import {
  type AzdoPullRequest,
  toMyStalePrs,
  toReviewRequested,
} from "../../src/adapters/azdo/map-pull-requests.js";

const ORG = "https://dev.azure.com/contoso";
const ME = "dev@example.com";
const NOW = new Date("2026-07-30T12:00:00Z");

function pr(overrides: Partial<AzdoPullRequest> = {}): AzdoPullRequest {
  return {
    pullRequestId: 101,
    title: "corrige cálculo de frete",
    isDraft: false,
    creationDate: "2026-07-29T18:32:56.6055786Z",
    repository: { name: "GestãoVendasFront", project: { name: "Projeto - Gestão de Vendas" } },
    reviewers: [{ uniqueName: ME, vote: 0, isRequired: true }],
    ...overrides,
  };
}

describe("toReviewRequested", () => {
  test("includes a PR where I have not voted yet", () => {
    const signals = toReviewRequested([pr()], { orgUrl: ORG, myEmail: ME });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.kind).toBe("review_requested");
    expect(signals[0]?.id).toBe("pr:101");
  });

  test("skips a PR I already approved", () => {
    const already = pr({ reviewers: [{ uniqueName: ME, vote: 10, isRequired: true }] });

    expect(toReviewRequested([already], { orgUrl: ORG, myEmail: ME })).toEqual([]);
  });

  test("skips drafts", () => {
    expect(toReviewRequested([pr({ isDraft: true })], { orgUrl: ORG, myEmail: ME })).toEqual([]);
  });

  test("skips PRs where I am not a reviewer", () => {
    const other = pr({ reviewers: [{ uniqueName: "teammate@example.com", vote: 0 }] });

    expect(toReviewRequested([other], { orgUrl: ORG, myEmail: ME })).toEqual([]);
  });

  // Project and repo names carry spaces and accents, so a raw join produces a broken link.
  test("builds a browser URL with the project and repo names encoded", () => {
    const [signal] = toReviewRequested([pr()], { orgUrl: ORG, myEmail: ME });

    expect(signal?.url).toBe(
      "https://dev.azure.com/contoso/Projeto%20-%20Gest%C3%A3o%20de%20Vendas/_git/Gest%C3%A3oVendasFront/pullrequest/101",
    );
  });

  test("carries creation time so the feed can sort by age", () => {
    const [signal] = toReviewRequested([pr()], { orgUrl: ORG, myEmail: ME });

    expect(signal?.since).toEqual(new Date("2026-07-29T18:32:56.6055786Z"));
  });
});

describe("toMyStalePrs", () => {
  test("flags my PR once it has been open longer than two days", () => {
    const old = pr({ pullRequestId: 7000, creationDate: "2026-07-27T09:00:00Z", reviewers: [] });

    const signals = toMyStalePrs([old], { orgUrl: ORG, now: NOW });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.kind).toBe("pr_mine_stale");
    expect(signals[0]?.id).toBe("pr-mine:7000");
  });

  test("leaves my recent PRs alone", () => {
    const fresh = pr({ creationDate: "2026-07-30T09:00:00Z", reviewers: [] });

    expect(toMyStalePrs([fresh], { orgUrl: ORG, now: NOW })).toEqual([]);
  });

  test("ignores drafts, which are not waiting on anyone", () => {
    const draft = pr({ creationDate: "2026-07-20T09:00:00Z", isDraft: true, reviewers: [] });

    expect(toMyStalePrs([draft], { orgUrl: ORG, now: NOW })).toEqual([]);
  });
});
