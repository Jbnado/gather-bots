# Google Calendar

About ten minutes, once. After that the service refreshes its own access.

## 1. Project and API

1. Create a project at <https://console.cloud.google.com/projectcreate>.
2. With it selected, go to **APIs & Services → Library**, find **Google Calendar API**, enable it.

## 2. Consent screen

**APIs & Services → OAuth consent screen**:

- User type: **Internal** if your Workspace allows it — simpler, and skips the next bullet.
  Otherwise **External**.
- Fill in the app name and your email in both required fields.
- Under **Test users**, add **your own address**. Without this, consent is refused with
  `access_denied`.

Leaving the app in *Testing* is correct — it is only for you. Note that a refresh token from an
app in Testing **expires after 7 days**. If the calendar stops updating after a week, that is
why: run `pnpm authorize:google` again, or publish the app for tokens without an expiry.

## 3. Credential

**APIs & Services → Credentials → Create credentials → OAuth client ID**:

- Application type: **Desktop app**.
- Copy the **Client ID** and **Client secret**.

No redirect URI to register — desktop clients accept `http://localhost` on any port, and the
script uses `53682`.

## 4. Authorize

```
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
```

```bash
pnpm authorize:google
```

Your browser opens, you consent, and the terminal prints the `GOOGLE_REFRESH_TOKEN=…` line to
paste into `.env`.

The scope requested is `calendar.events.readonly` — reading events, nothing else. The token
cannot create, change or delete anything.

## 5. Check

```bash
pnpm checkup
pnpm once
```

If it fails with `google token refresh failed`, the token expired (Testing mode, 7 days).
Reauthorize.

## What the calendar changes

| Object | Before | After |
|---|---|---|
| Lightbulb | always lit | dark during a meeting, or one starting in ≤5 min |
| Bot Status | pipelines only | gains `working` during a meeting, `alert` on a clash |
| Inbox | PRs and tasks | gains unanswered invites |

Ignored on purpose: all-day events, declined events, and anything the organiser marked as free.
A birthday in your calendar should not darken the bulb for a whole day.
