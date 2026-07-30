import type { Signal } from "../../domain/signal.js";

/** Only the fields we depend on. Azure DevOps returns far more. */
export type AzdoPullRequest = {
  pullRequestId: number;
  title: string;
  isDraft?: boolean;
  creationDate: string;
  repository: { name: string; project: { name: string } };
  reviewers?: Array<{ uniqueName?: string; vote?: number; isRequired?: boolean }>;
};

/** Azure DevOps vote codes: 10 approved, 5 approved w/ suggestions, 0 none, -5 waiting, -10 rejected. */
const NO_VOTE_YET = 0;

const STALE_AFTER_MS = 2 * 24 * 60 * 60_000;

/**
 * The PR's `url` field is the REST resource, which is useless in a feed. The browser URL has to
 * be composed, and project/repo names routinely contain spaces and accents — so each segment is
 * encoded rather than joined raw.
 */
function webUrl(pr: AzdoPullRequest, orgUrl: string): string {
  const org = orgUrl.replace(/\/+$/, "");
  const project = encodeURIComponent(pr.repository.project.name);
  const repo = encodeURIComponent(pr.repository.name);
  return `${org}/${project}/_git/${repo}/pullrequest/${pr.pullRequestId}`;
}

export function toReviewRequested(
  prs: readonly AzdoPullRequest[],
  opts: { orgUrl: string; myEmail: string },
): Signal[] {
  return prs
    .filter((pr) => pr.isDraft !== true)
    .filter((pr) =>
      pr.reviewers?.some((r) => r.uniqueName === opts.myEmail && r.vote === NO_VOTE_YET),
    )
    .map((pr) => ({
      id: `pr:${pr.pullRequestId}`,
      source: "azdo-prs" as const,
      kind: "review_requested" as const,
      title: `PR #${pr.pullRequestId} · ${pr.title}`,
      url: webUrl(pr, opts.orgUrl),
      since: new Date(pr.creationDate),
    }));
}

/** My own PRs that have sat open long enough that someone needs a nudge. */
export function toMyStalePrs(
  prs: readonly AzdoPullRequest[],
  opts: { orgUrl: string; now: Date },
): Signal[] {
  return prs
    .filter((pr) => pr.isDraft !== true)
    .filter((pr) => opts.now.getTime() - new Date(pr.creationDate).getTime() > STALE_AFTER_MS)
    .map((pr) => ({
      id: `pr-mine:${pr.pullRequestId}`,
      source: "azdo-prs" as const,
      kind: "pr_mine_stale" as const,
      title: `PR #${pr.pullRequestId} parado · ${pr.title}`,
      url: webUrl(pr, opts.orgUrl),
      since: new Date(pr.creationDate),
    }));
}
