# Uptime monitor (webhook)

The only integration that **listens** rather than asks. Your monitor posts here when something
goes down, and the outage shows up on the next tick.

```
UPTIME_WEBHOOK_TOKEN=<a long random string>
```

That's the minimum. Generate one with `openssl rand -hex 32` — it's a password, and anyone who
has it can light up your office.

Optional:

```
UPTIME_WEBHOOK_PORT=8787          # default
UPTIME_TTL_HOURS=24               # default
UPTIME_STATE_FILE=./state/incidents.json
```

## Pointing your monitor at it

Every route wants the token in the `x-webhook-token` header and answers **202** on success,
**401** without a valid token, **400** for a payload it can't read.

### Generic — anything that lets you write your own body

```
POST /incidents
Content-Type: application/json
x-webhook-token: <token>

{ "id": "checkout", "status": "down", "title": "Checkout", "url": "https://status.example.com" }
```

`id` must be **stable per monitored check**: recovery is matched by it, and an outage opened
under one id can never be closed by an `up` sent under another.

### Grafana / Alertmanager

```
POST /incidents/grafana
```

Point a contact point of type *webhook* at it and add the token as a custom header. The whole
`alerts[]` batch is processed; `firing` opens an outage and `resolved` closes it. The alert
`fingerprint` becomes the id, falling back to `alertname/instance`. The title comes from
`annotations.summary`.

### UptimeRobot

```
POST /incidents/uptimerobot
```

Set the alert contact to *Web-Hook*, enable "send as POST", and add the token header. Form
encoding is handled. `alertType` 1 opens, 2 closes, and 3 (SSL expiring) is **ignored on
purpose** — it is real, but it is not an outage, and lighting the object for it teaches everyone
to ignore the object.

### upwatch

```
POST /incidents/upwatch
```

In [upwatch](https://github.com/Jbnado/upwatch), create a channel of type **Webhook**:

- URL: `http://<host>:8787/incidents/upwatch`
- Header: `x-webhook-token: <token>`
- Leave the body mapping (`body_template`) **empty**. This route reads upwatch's standard
  envelope as is: `monitor`, `monitor_id`, `status`, `target`, `message` and, when the monitor
  belongs to one, `group` (its path, e.g. `RPA / prod`).

Attach the channel to every group you want to see. The environment comes from the group path:
when any segment of it is a staging name (`hml`, `homolog`, `homologacao`, `staging`, `stage`,
`stg`, `dev`, `develop`, `development`, `test`, `teste`, `qa`, `sandbox`, `preview`, case
ignored), the check counts as staging — `RPA / hml`, `Sondas / hml`. Anything else, including no
group at all, counts as **production**: missing prod is worse than a bulb lit by mistake.

| Environment | Bot Status Monitor | Prod bulb |
|---|---|---|
| production, down | `alert` | lit |
| staging, down | `question` | dark |
| either, slow | `question` | dark |

All of them show in the feed. A probe for a staging VM belongs under a staging group too
(`Sondas / hml`), or its silence lights the prod bulb.

The id is `upwatch:<monitor_id>`, so renaming a monitor or moving it between groups does not
orphan an open outage. Any status other than the four below gets a 400.

| upwatch status | Effect |
|---|---|
| `down` | opens an outage |
| `degraded` | opens a **slowdown** — slow is not down |
| `up` | closes whatever is open for that check |
| `unknown` | **ignored on purpose**: the absence of a result says nothing either way |

Outage and slowdown share the check's id, so a check is down, slow or fine, never two at once:
`down → degraded` closes the outage (the bulb goes dark) and opens a slowdown, `degraded → down`
does the reverse, and each switch restarts the "for how long" clock. A slowdown is persisted and
ages out under `UPTIME_TTL_HOURS` exactly like an outage.

The title is `<group> · <monitor>` (just the monitor when it has no group): monitors are usually
called `api` or `front`, and the group is what says which system is down. upwatch's `message`
(the cause, e.g. `connection refused`) goes after the duration in the feed, and the `target`
becomes the entry's link when it is a web address.

## Exposing it

The service listens on plain HTTP with no TLS of its own. Put it behind whatever already
terminates TLS for you, and prefer keeping it on an internal network:

```yaml
# compose.yaml — publish only if your monitor is external
ports:
  - "127.0.0.1:8787:8787"
```

Binding to `127.0.0.1` means only a reverse proxy on the same host can reach it. Dropping the
`127.0.0.1:` opens it to anything that can route to the host, which is worth doing deliberately
rather than by accident.

`GET /health` needs no token, so an orchestrator can probe liveness without holding a secret.

## How an outage ages

An open outage stays open until recovery arrives — that is what a monitor expects, and it may be
hours.

But a monitor that dies mid-outage never sends recovery, so an outage nobody has re-reported for
`UPTIME_TTL_HOURS` is dropped. An alarm nobody can clear is one everybody learns to ignore.
Monitors that re-notify periodically refresh the clock automatically; if yours only notifies once
per state change, raise the TTL to comfortably exceed your longest plausible outage.

Open outages are persisted to disk. A restart during an outage must not turn the light green
while the site is still down.

## What it changes

| Object | Effect |
|---|---|
| Bot Status Monitor | `alert` while anything in production is down, `question` while something is only slow or down in staging (upwatch's `degraded`), each with the check, how long it has been going and its cause in the feed; `on` (the smiling face) while the monitor answers with nothing open, even with no other integration — but `off` if this integration is failing, since silence is not evidence |
| Lightbulb on `prod-health` | lit while anything in production is down, and **not** for a slowdown or for staging; with no pipeline integration, its description reads "Nenhuma queda aberta" while nothing is down — never "healthy", since a monitor only knows about the checks it has |

An outage counts as production by definition — nobody pages for staging.
