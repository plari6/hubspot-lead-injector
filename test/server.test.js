'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/server');
const { HubSpotError } = require('../src/hubspotService');
const samples = require('../data/sample-lead.json');

const silentLogger = { info() {}, error() {} };

function appWith(syncLead, options = {}) {
  const calls = [];
  const app = createApp({
    syncLead: async (lead) => {
      calls.push(lead);
      return syncLead(lead);
    },
    webhookSecret: '',
    logger: silentLogger,
    ...options,
  });
  return { app, calls };
}

test('GET /health returns ok', async () => {
  const { app } = appWith(async () => ({}));
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('POST /api/leads/inject returns 201 when a contact is created', async () => {
  const { app, calls } = appWith(async () => ({ action: 'created', contactId: '501' }));
  const res = await request(app).post('/api/leads/inject').send(samples.valid);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.action, 'created');
  assert.equal(res.body.contactId, '501');
  assert.equal(typeof res.body.durationMs, 'number');
  // The service receives normalized data
  assert.equal(calls[0].email, 'jane.doe@example.com');
  assert.equal(calls[0].phone, '+15551234567');
});

test('POST /api/leads/inject returns 200 when a contact is updated', async () => {
  const { app } = appWith(async () => ({ action: 'updated', contactId: '123' }));
  const res = await request(app).post('/api/leads/inject').send(samples.minimal);

  assert.equal(res.status, 200);
  assert.deepEqual(
    { action: res.body.action, contactId: res.body.contactId },
    { action: 'updated', contactId: '123' },
  );
});

test('returns 400 with details for invalid payloads and never calls HubSpot', async () => {
  const { app, calls } = appWith(async () => ({ action: 'created', contactId: '1' }));
  for (const payload of [samples.invalidEmail, samples.missingNames, samples.invalidPhone, {}]) {
    const res = await request(app).post('/api/leads/inject').send(payload);
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.details) && res.body.details.length > 0);
  }
  assert.equal(calls.length, 0);
});

test('returns 400 for malformed JSON', async () => {
  const { app } = appWith(async () => ({}));
  const res = await request(app)
    .post('/api/leads/inject')
    .set('Content-Type', 'application/json')
    .send('{"email": "broken"');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Malformed JSON body');
});

test('returns 502 when HubSpot fails', async () => {
  const { app } = appWith(async () => {
    throw new HubSpotError('HubSpot request failed (HTTP 500)', { status: 500 });
  });
  const res = await request(app).post('/api/leads/inject').send(samples.minimal);
  assert.equal(res.status, 502);
  assert.equal(res.body.success, false);
});

test('returns 503 when the HubSpot token is not configured', async () => {
  const { app } = appWith(async () => {
    throw new HubSpotError('HUBSPOT_ACCESS_TOKEN is not configured', { status: 503 });
  });
  const res = await request(app).post('/api/leads/inject').send(samples.minimal);
  assert.equal(res.status, 503);
});

test('requires x-api-key when a webhook secret is set', async () => {
  const { app, calls } = appWith(async () => ({ action: 'created', contactId: '9' }), { webhookSecret: 's3cret' });

  const missing = await request(app).post('/api/leads/inject').send(samples.minimal);
  assert.equal(missing.status, 401);

  const wrong = await request(app).post('/api/leads/inject').set('x-api-key', 'nope').send(samples.minimal);
  assert.equal(wrong.status, 401);
  assert.equal(calls.length, 0);

  const ok = await request(app).post('/api/leads/inject').set('x-api-key', 's3cret').send(samples.minimal);
  assert.equal(ok.status, 201);
});

test('unknown routes return 404 JSON', async () => {
  const { app } = appWith(async () => ({}));
  const res = await request(app).get('/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});
