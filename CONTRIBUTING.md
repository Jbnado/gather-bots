# Contributing

The point of the architecture is that you can add things without understanding the middle. Pick
the extension point that matches what you want, and ignore the rest.

```
  sources  →  Signal[]  →  surfaces  →  Snapshot  →  diff  →  destination
     ↑                        ↑                                    ↑
  add here               or here                              or here
```

`src/domain/` knows nothing about Azure DevOps, Google, Microsoft — or about Gather. That is
deliberate and worth preserving.

## Adding a source

A source turns some upstream system into `Signal[]`. Jira, GitHub, Linear, PagerDuty, your
company's internal API — all the same shape.

**1. Shape the data with a pure function.** Keep the mapping of upstream JSON into `Signal`
separate from the HTTP, so it can be tested without the network:

```ts
export function toJiraSignals(issues: readonly JiraIssue[]): Signal[] { … }
```

**2. Implement `SignalSourcePort`** — one method, `collect(now)`. Do the HTTP here and hand off
to the pure function.

**3. Export an `Integration`** describing what it needs:

```ts
export const jira: Integration = {
  id: "jira",
  label: "Jira",
  docs: "docs/integrations/jira.md",
  env: [
    { name: "JIRA_URL", required: true, describe: "https://you.atlassian.net" },
    { name: "JIRA_TOKEN", required: true, describe: "API token" },
  ],
  create: (env) => createJiraSource({ url: required(env, "JIRA_URL"), … }),
};
```

**4. Add it to the array** in `src/integrations/index.ts`, and write `docs/integrations/jira.md`.

You get several things without asking: it stays off until configured, `pnpm checkup` lists it
with the exact missing variable, and a brief outage upstream won't blank anyone's feed.

### Choosing a `SignalKind`

Report the fact, not where it should be displayed. `review_requested` is a fact;
"goes in the inbox" is a presentation decision that belongs to a surface. If your source decides
placement, changing what an object means later requires editing every source.

Reuse an existing kind when the meaning matches — a Jira issue assigned to me is
`work_item_assigned`, not a new kind. Add to `SignalKind` only for genuinely new meanings.

### Namespacing ids

Every signal id must be unique across all sources sharing an object: `jira:PROJ-123`, not `123`.
Ids over 128 characters are rejected by Gather — hash long upstream ids to something short and
**stable**, since the dispatcher matches feed entries by id to work out what changed.

## Adding a surface

A surface is a pure function from signals to a snapshot. Add it to `SURFACES` in
`src/objects/registry.ts` with the preset it requires, and it becomes selectable via the
matching `*_SURFACE` variable.

Presets constrain what you can express: `switch` is two states, `status` has five,
`inbox` has a count plus a feed. `webhook.ping` reports what an object actually is, and startup
refuses a mismatch.

## Adding a destination

Implement `SmartObjectPort` and the whole pipeline drives something that is not Gather — a
Philips Hue bulb, a Slack status, an LED strip. Nothing else changes.

## Tests

```bash
pnpm test        # no network, no credentials
pnpm typecheck
```

Tests run against fakes, never a real space. `FakeSmartObject` records the exact command sequence
so you can assert on what would have gone over the wire.

Write the test first and watch it fail. Every existing test was written that way, and several
caught real bugs before they shipped: the state file that would blank objects on a fresh install,
the Microsoft timestamp that parsed three hours off, the Azure DevOps filter that silently
returned every PR in the organisation.

When a test needs a specific moment in time, pass it in — nothing in the core reads the clock
directly, which is what keeps "meeting in 10 minutes" testable.

## Style

Comments explain **why**, not what. If a line needs a comment to say what it does, rename
something instead. The comments worth writing are the ones recording a decision someone would
otherwise undo — an API that behaves unexpectedly, an abstraction deliberately not built, an
ordering that matters.
