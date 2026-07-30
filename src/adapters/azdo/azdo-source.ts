import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import { type AzdoPullRequest, toMyStalePrs, toReviewRequested } from "./map-pull-requests.js";

export type AzdoConfig = {
  orgUrl: string;
  pat: string;
  myEmail: string;
};

type PrPage = { value?: AzdoPullRequest[] };

/**
 * Azure DevOps silently ignores a malformed `searchCriteria.*` value and returns the unfiltered
 * list with a 200. That looked like a working filter during development while actually returning
 * every PR in the organisation, so the identity id is resolved up front and a failure to resolve
 * it is fatal rather than degrading into "everyone's PRs".
 */
export function createAzdoSource(config: AzdoConfig): SignalSourcePort {
  const org = config.orgUrl.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`:${config.pat}`).toString("base64")}`;
  let identityId: string | undefined;

  async function get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`azure devops ${res.status} for ${new URL(url).pathname}`);
    }
    return (await res.json()) as T;
  }

  /** `connectionData` rejects an explicit api-version; requesting one returns 400. */
  async function myId(): Promise<string> {
    if (identityId !== undefined) return identityId;

    const data = await get<{ authenticatedUser?: { id?: string } }>(`${org}/_apis/connectionData`);
    const id = data.authenticatedUser?.id;
    if (id === undefined || id === "") {
      throw new Error("could not resolve the authenticated Azure DevOps identity");
    }
    identityId = id;
    return id;
  }

  function prs(criteria: string, id: string): Promise<PrPage> {
    return get<PrPage>(
      `${org}/_apis/git/pullrequests?api-version=7.1&$top=100` +
        `&searchCriteria.status=active&searchCriteria.${criteria}=${id}`,
    );
  }

  return {
    id: "azdo-prs",
    async collect(now: Date): Promise<Signal[]> {
      const id = await myId();
      const [reviewing, mine] = await Promise.all([
        prs("reviewerId", id),
        prs("creatorId", id),
      ]);

      return [
        ...toReviewRequested(reviewing.value ?? [], { orgUrl: org, myEmail: config.myEmail }),
        ...toMyStalePrs(mine.value ?? [], { orgUrl: org, now }),
      ];
    },
  };
}
