# Azure DevOps

Three separate integrations share one token. Enable any subset — each turns on only when its own
variables are filled in.

| Integration | Shows | Needs |
|---|---|---|
| pull requests | reviews waiting on you, your own stalled PRs | `AZDO_USER_EMAIL` |
| work items | tasks in states you choose | `AZDO_WORK_ITEM_STATES` |
| pipelines | build health, prod vs develop | `AZDO_BUILD_SCOPE` |

## 1. Token

**User settings → Personal access tokens → New Token.**

Read-only scopes are enough, and are all you should grant:

- **Code** → Read
- **Build** → Read
- **Work Items** → Read

```
AZDO_ORG_URL=https://dev.azure.com/your-org
AZDO_PAT=<token>
AZDO_USER_EMAIL=you@company.com
```

`AZDO_USER_EMAIL` must match the `uniqueName` Azure DevOps has for you — usually your work
address. It is how "waiting on my review" is told apart from "waiting on someone".

Queries run at organisation level, so there is no project to pick: every repository you can see
is covered.

## 2. Work items (optional)

```
AZDO_WORK_ITEM_STATES=Doing,Rework,To do
```

State names come from your process template and vary a lot — check Azure Boards for the ones
your team actually uses. Choose narrowly. A developer typically has dozens of items assigned
across every state; listing them all buries the two or three that are genuinely in flight.

Anything not listed is ignored, including Closed and Removed.

### Only the current sprint

```
AZDO_WORK_ITEM_TEAM=My Project/My Team
AZDO_WORK_ITEM_CURRENT_SPRINT=true
```

The team is not optional here, and the reason is an Azure DevOps rule rather than a design
choice: an organisation-wide query answers

```
VS402612: The macro '@CurrentIteration' is not supported without a team context.
```

Supplying the team switches the request to that team's WIQL endpoint, where `@CurrentIteration`
resolves against that team's iteration schedule. The trade-off is coverage — the query then sees
only that team's project, instead of every project you have access to.

Setting `AZDO_WORK_ITEM_CURRENT_SPRINT=true` without a team is ignored rather than treated as an
error, so a half-finished configuration degrades to the organisation-wide behaviour instead of
failing every tick.

## 3. Pipelines (optional)

```
AZDO_BUILD_SCOPE=[{"project":"Web"},{"project":"Platform","match":"^api-"}]
```

JSON on one line. Omit `match` to watch every pipeline in the project; supply a regex on the
pipeline name to narrow it.

Only `refs/heads/main`, `refs/heads/master` and `refs/heads/develop` count. Feature branches and
`refs/pull/*` validation builds are ignored: a red PR build is the author's problem, not the
room's.

Main and master map to **prod**, develop maps to **develop**, and the status surface treats a
broken prod as `alert` and a broken develop as `question`.

Only the **latest** run per pipeline and branch decides anything, so a failure that has since
been fixed stops mattering as soon as a newer run passes.

## Verify

```bash
pnpm checkup
pnpm once
```

## Notes

**Azure DevOps ignores a malformed `searchCriteria` value and answers 200 with the unfiltered
list.** During development this looked exactly like a working filter while actually returning
every PR in the organisation. The identity is resolved before any query and failing to resolve it
is fatal, deliberately, rather than degrading into everyone's PRs. If you extend this integration,
keep that property.

**`connectionData` rejects an explicit `api-version`** and answers 400. Omit the parameter.
