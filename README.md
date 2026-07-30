# gather-bots

Drive [Gather](https://gather.town) Smart Objects from your real work — pull requests waiting on
you, pipelines that broke, tasks in progress, meetings about to start. Your desk in the virtual
office tells your team what's going on without anyone opening another tab.

*[Leia em português](README.pt-BR.md)*

```
INBOX          [8]  what is waiting on me
                    PR #101 · fix shipping calculation
                    Bug · Doing · rounding error on invoices

BOT STATUS   alert   what is running without me
                    svc-orders · main   ← pipeline is red

LIGHTBULB      off   can I be interrupted?
                    "In a meeting: Weekly"
```

**Nothing you don't configure ever runs.** Set up one object and one integration and it works.
Add more whenever you feel like it. Anything unconfigured stays quietly off.

## Quick start

```bash
git clone https://github.com/Jbnado/gather-bots.git
cd gather-bots
pnpm install
cp .env.example .env
pnpm checkup          # tells you exactly what to fill in next
```

`pnpm checkup` is the command to run whenever something looks wrong. It reports every object and
every integration as one of three things:

| | meaning |
|---|---|
| `✓` | working |
| `○` | not configured — perfectly fine, here's the variable that would switch it on |
| `✗` | configured but broken — the only line worth your attention |

Then:

```bash
pnpm once     # one pass, then exit — good for checking what would be sent
pnpm start    # keep going, polling every POLL_INTERVAL_SECONDS
```

## What can drive what

Objects are placed in Gather (Main Menu → Decorate Desk → Smart Objects). Each has its own
webhook URL and API key, both from the object's ⋮ menu.

| Object | Preset | Default surface |
|---|---|---|
| Inbox | `inbox` | `inbox` — a count plus a clickable feed of what needs you |
| Bot Status Monitor | `status` | `activity-monitor` — one symbol for what's running |
| Lightbulb | `switch` | `availability` — dark while you're in a meeting |

A **surface** is one way of reading your signals onto an object, and you can swap it:

```bash
GATHER_LIGHTBULB_SURFACE=prod-health   # lit when production is broken instead
```

Built-in surfaces: `inbox`, `activity-monitor`, `availability`, `prod-health`.

## Integrations

| Integration | Gives you | Setup |
|---|---|---|
| Azure DevOps — pull requests | reviews waiting on you, your own stalled PRs | [guide](docs/integrations/azure-devops.md) |
| Azure DevOps — work items | tasks in the states you care about | [guide](docs/integrations/azure-devops.md) |
| Azure DevOps — pipelines | build health, prod and develop told apart | [guide](docs/integrations/azure-devops.md) |
| Google Calendar | meetings, unanswered invites | [guide](docs/integrations/google-calendar.md) |
| Outlook / Microsoft 365 | the same, from a Microsoft tenant | [guide](docs/integrations/outlook.md) |

Both calendars can run at once. They produce the same kinds of signal and the surfaces never ask
which one a signal came from.

## Adding your own

The core knows nothing about Azure DevOps, Google, Microsoft — or even about Gather. Ports and
adapters throughout, so there are three separate things you can add without touching the middle.

**A new source** (Jira, GitHub, Linear, PagerDuty, your own API):

```ts
export const jira: Integration = {
  id: "jira",
  label: "Jira",
  docs: "docs/integrations/jira.md",
  env: [{ name: "JIRA_TOKEN", required: true, describe: "API token" }],
  create: (env) => ({
    id: "jira",
    async collect(now) { /* → Signal[] */ },
  }),
};
```

Add it to the array in `src/integrations/index.ts`. That's the whole contract — you never touch
the dispatcher, the diff, or anything Gather-specific, and the checkup output, the graceful
"stays off when unconfigured" behaviour and the outage tolerance all come for free.

**A new surface** — a pure function from signals to a snapshot, added to `SURFACES` in
`src/objects/registry.ts`. Testable in a few lines with no network.

**A new destination** — implement `SmartObjectPort` and the whole pipeline drives something that
isn't Gather at all: a Philips Hue bulb, a Slack status, an LED strip on your monitor.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Things that bite

**Gather's rate limit is per space, not per object.** The dispatcher compares against the last
state it sent (`state/last-sent.json`) and transmits only the difference, so a quiet minute costs
**zero** requests. Delete that file to force a full resend.

**`activity.clear` is forbidden.** One object carries entries from several sources, so clearing
would wipe the others'. The `Command` type deliberately omits the event, so the compiler refuses
it rather than a reviewer having to catch it.

**The activity feed is visible to every Member and Guest in the space.** PR and task titles show
up for anyone in the room. Don't point this at anything more sensitive than that.

**An integration that's down doesn't blank your feed.** Its last good result stands in for up to
15 minutes; past that its items disappear, because a meeting that ended an hour ago is worse than
no meeting at all. If every source fails at once, nothing is written — that's a network outage,
not everything finishing simultaneously.

**Writing to an object outside the pipeline desyncs the state file.** The diff will not correct
the difference. Delete `state/last-sent.json` after any manual poke.

## Running it continuously

`scripts/install-task.ps1` registers it as a Windows scheduled task that starts at logon, no
admin needed. On Linux or macOS, any supervisor works — it's a plain Node process.

## License

MIT OR Apache-2.0, at your option.
