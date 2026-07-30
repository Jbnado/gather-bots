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
| Bot Status Monitor | `alert`, with the outage and how long it has been going in the feed |
| Lightbulb on `prod-health` | lit while anything is down |

An outage counts as production by definition — nobody pages for staging.
