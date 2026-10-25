# HubSpot Lead Injector

A real-time Express webhook that takes lead payloads from website forms or chatbots, validates and cleans them, and upserts them into HubSpot CRM. It updates the contact if the email already exists and creates it if not.

## Why

**Speed to lead.** When reps take 4 to 24 hours to type new leads into HubSpot, the leads go cold. This service puts the lead in HubSpot within about 2 seconds of the form being submitted.

**Clean CRM data.** Emails are validated and lowercased, phone numbers are normalized, and HubSpot is searched by email before anything is written, so you don't get duplicate contacts.

## Features

- `POST /api/leads/inject`: validate, then search by email, then update or create
- Validation: valid email; required `firstname` and `lastname`; optional `phone` (7 to 15 digits, normalized to e.g. `+15551234567`); `website` must be a URL
- Allow-list of properties: only `email, firstname, lastname, phone, company, jobtitle, website, city, state, country, lifecyclestage` are sent to HubSpot. Unknown fields are dropped.
- Duplicate-safe: if two submissions arrive at the same moment and both miss the search (HubSpot's search index lags behind writes), a `409 Contact already exists` from HubSpot is caught and turned into an update.
- Automatic retries on HubSpot rate limits (429) and 5xx errors
- Optional shared-secret auth through the `x-api-key` header (`WEBHOOK_SECRET`)
- `GET /health` endpoint for uptime checks
- JSON error responses for bad JSON (400), oversized bodies (413), unknown routes (404), HubSpot failures (502) and a missing token (503)

## Setup

1. In HubSpot go to **Settings → Integrations → Private Apps** (called "Legacy apps" in newer accounts), create an app, and give it these scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
2. Install and configure:

```bash
npm install
cp .env.example .env   # then set HUBSPOT_ACCESS_TOKEN (and optionally WEBHOOK_SECRET)
npm start
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (3000) | HTTP port |
| `HUBSPOT_ACCESS_TOKEN` | yes | Private app access token |
| `WEBHOOK_SECRET` | recommended | When set, requests must send `x-api-key: <secret>` |

## Usage

```bash
curl -X POST http://localhost:3000/api/leads/inject \
  -H "Content-Type: application/json" \
  -H "x-api-key: <WEBHOOK_SECRET>" \
  -d '{"email":"jane@example.com","firstname":"Jane","lastname":"Doe","phone":"+1 (555) 123-4567"}'
```

Or send one of the payloads in `data/sample-lead.json` to a running server:

```bash
npm run send-sample            # sends "valid"
npm run send-sample -- minimal # or: invalidEmail, missingNames, invalidPhone
```

### Responses

| Status | Meaning | Body |
|---|---|---|
| 201 | Contact created | `{ "success": true, "action": "created", "contactId": "501", "durationMs": 640 }` |
| 200 | Existing contact updated | `{ "success": true, "action": "updated", "contactId": "123", "durationMs": 410 }` |
| 400 | Validation failed / bad JSON | `{ "success": false, "error": "Validation failed", "details": [{ "field": "email", "message": "..." }] }` |
| 401 | Missing or wrong `x-api-key` | |
| 502 | HubSpot rejected the request | `{ "success": false, "error": "HubSpot request failed (HTTP 401)" }` |
| 503 | `HUBSPOT_ACCESS_TOKEN` not configured | |

## Tests

```bash
npm test
```

The tests use Node's built-in test runner and supertest. HubSpot is replaced by a fake client, so no token or network access is needed.

## Project structure

```
data/sample-lead.json        Sample webhook payloads (valid and invalid)
scripts/send-sample.js       Posts a sample payload to a running server
src/config.js                Environment configuration
src/validation.js            Payload validation and normalization
src/hubspotService.js        HubSpot search, update, create (upsert) logic
src/server.js                Express app and webhook endpoint
test/                        Unit and HTTP tests
.claude/skills/hubspot-lead-injector/instructions.md   Claude Skill definition
```
