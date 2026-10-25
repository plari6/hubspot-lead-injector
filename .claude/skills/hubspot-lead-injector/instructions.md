---
name: hubspot-lead-injector
description: Run, test, extend, or troubleshoot the HubSpot Lead Injector, an Express webhook that validates leads and upserts them into HubSpot CRM by email. Use when working on lead capture, the /api/leads/inject endpoint, HubSpot contact sync, or adding new lead fields.
---

# HubSpot Lead Injector

## What it does
A Node.js/Express service that receives lead payloads (website forms, chatbots, ad platforms) on `POST /api/leads/inject`. It validates and normalizes each lead, then upserts it into HubSpot:

1. Search contacts by email (`crm.contacts.searchApi.doSearch`, `EQ` filter)
2. If found: `crm.contacts.basicApi.update` and respond `200 { action: "updated", contactId }`
3. If not found: `crm.contacts.basicApi.create` and respond `201 { action: "created", contactId }`
4. If create returns `409 ... Existing ID: N` (two submissions at once, or search-index lag): update contact N instead

## Business value
- Speed to lead: leads land in HubSpot in under 2 seconds instead of 4 to 24 hours of manual entry.
- Data quality: email validation, phone normalization and dedupe by email keep the CRM free of duplicates and bad addresses.

## Key files
- `src/server.js`: `createApp({ syncLead, webhookSecret, logger })`. Dependencies are injectable for tests.
- `src/validation.js`: `validateLead(body)`. Holds the allow-list of HubSpot properties (`OPTIONAL_FIELDS`).
- `src/hubspotService.js`: `createHubSpotService(client)` and `syncLeadToHubSpot(lead)`.
- `src/config.js`: env vars `PORT`, `HUBSPOT_ACCESS_TOKEN`, `WEBHOOK_SECRET`.
- `data/sample-lead.json`: named sample payloads.

## Common tasks
- **Run:** `npm start` (or `npm run dev` to restart on file changes). Check with `GET /health`.
- **Test:** `npm test`. HubSpot is faked, so no token is needed. Keep all tests passing.
- **Send a sample:** `npm run send-sample -- <valid|minimal|invalidEmail|missingNames|invalidPhone>`
- **Add a lead field:** add the HubSpot internal property name to `OPTIONAL_FIELDS` in `src/validation.js`, add any special validation there, and add a test in `test/validation.test.js`. Custom properties must exist in HubSpot first.

## Rules
- Never commit `.env` or a real access token.
- Only allow-listed properties may reach HubSpot. Never forward the raw request body.
- The private app needs `crm.objects.contacts.read` and `crm.objects.contacts.write` scopes.

## Troubleshooting
- `503 HUBSPOT_ACCESS_TOKEN is not configured`: set the token in `.env` and restart.
- `502 ... (HTTP 401)`: the token is invalid or revoked. `(HTTP 403)`: the token is missing contact scopes.
- `502 ... (HTTP 400)`: a property name doesn't exist in HubSpot, or a value is invalid (for example a bad `lifecyclestage`).
- `401 Invalid or missing x-api-key`: the caller must send the `WEBHOOK_SECRET` value.
