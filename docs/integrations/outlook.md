# Outlook / Microsoft 365

About five minutes, once. Uses the **device code** flow, so there is no redirect URI to
register — which matters when the tenant belongs to your employer.

## 1. Register the app

Azure portal → **Microsoft Entra ID → App registrations → New registration**:

- Name: `gather-bots`
- Account types: **Accounts in this organizational directory only**
- Leave the Redirect URI **blank**

From the Overview page, copy:

- **Application (client) ID** → `MS_CLIENT_ID`
- **Directory (tenant) ID** → `MS_TENANT_ID`

## 2. Enable device code

Under **Authentication → Advanced settings**, turn on **Allow public client flows**. Without it
the device code flow fails with `unauthorized_client`.

## 3. Permission

**API permissions → Add → Microsoft Graph → Delegated permissions** → `Calendars.Read`.

Delegated, not application: the service reads **your** calendar as you, not everyone's mailbox.
If it says "Admin consent required", ask your tenant admin — some organisations require it even
for delegated permissions.

## 4. Authorize

```
MS_TENANT_ID=<directory id>
MS_CLIENT_ID=<application id>
```

```bash
pnpm authorize:outlook
```

The terminal shows a URL and a code. Open it, paste the code, approve, and it prints the
`MS_REFRESH_TOKEN=…` line for `.env`.

## If your admin won't allow an app registration

Publish your Outlook calendar as ICS instead (**Outlook web → Settings → Calendar → Shared
calendars → Publish**) and open an issue — a `.ics` source needs no registration at all. The
cost is latency: Outlook can take hours to reflect a change in the published file, which makes
"in a meeting right now" unreliable.

## Two providers at once

Google and Outlook can both run. They produce the same signal kinds and the surfaces never ask
which provider a signal came from.

An event present in both calendars appears twice in the feed. Ids are namespaced per provider on
purpose — there is no reliable way to know two entries are the same meeting.

## Notes

**Graph event ids exceed the 128-character limit** on `activity.id`, so they are hashed to a
short, stable id.

**Graph returns `"2026-07-30T17:00:00.0000000"` with the zone in a separate field**, so the
string carries no offset. Parsed as-is it reads as local time — three hours off in UTC−3, which
lights the bulb during the wrong hour. The request asks for UTC via the `Prefer` header and the
`Z` is appended explicitly.
