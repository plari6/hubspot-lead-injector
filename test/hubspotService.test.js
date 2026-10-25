'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHubSpotService, HubSpotError } = require('../src/hubspotService');

/** Minimal fake of the @hubspot/api-client surface we use, recording every call. */
function fakeClient({ searchResults = [], createImpl, updateImpl } = {}) {
  const calls = { search: [], create: [], update: [] };
  const client = {
    crm: {
      contacts: {
        searchApi: {
          doSearch: async (req) => {
            calls.search.push(req);
            return { total: searchResults.length, results: searchResults };
          },
        },
        basicApi: {
          create: async (req) => {
            calls.create.push(req);
            return createImpl ? createImpl(req) : { id: '501' };
          },
          update: async (id, req) => {
            calls.update.push({ id, req });
            return updateImpl ? updateImpl(id, req) : { id };
          },
        },
      },
    },
  };
  return { client, calls };
}

const lead = { email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe' };

test('creates a contact when none exists', async () => {
  const { client, calls } = fakeClient();
  const result = await createHubSpotService(client).syncLeadToHubSpot(lead);

  assert.deepEqual(result, { action: 'created', contactId: '501' });
  assert.equal(calls.search.length, 1);
  assert.deepEqual(calls.search[0].filterGroups[0].filters[0], {
    propertyName: 'email',
    operator: 'EQ',
    value: 'jane@example.com',
  });
  assert.deepEqual(calls.create[0].properties, lead);
  assert.equal(calls.update.length, 0);
});

test('updates the contact when the email already exists', async () => {
  const { client, calls } = fakeClient({ searchResults: [{ id: '123', properties: {} }] });
  const result = await createHubSpotService(client).syncLeadToHubSpot(lead);

  assert.deepEqual(result, { action: 'updated', contactId: '123' });
  assert.equal(calls.update[0].id, '123');
  assert.deepEqual(calls.update[0].req.properties, lead);
  assert.equal(calls.create.length, 0);
});

test('falls back to update when create hits a 409 duplicate', async () => {
  const conflict = Object.assign(new Error('HTTP-Code: 409'), {
    code: 409,
    body: { status: 'error', message: 'Contact already exists. Existing ID: 777', category: 'CONFLICT' },
  });
  const { client, calls } = fakeClient({
    createImpl: () => {
      throw conflict;
    },
  });
  const result = await createHubSpotService(client).syncLeadToHubSpot(lead);

  assert.deepEqual(result, { action: 'updated', contactId: '777' });
  assert.equal(calls.update[0].id, '777');
});

test('wraps HubSpot API errors in a HubSpotError with the status code', async () => {
  const { client } = fakeClient({
    createImpl: () => {
      throw Object.assign(new Error('HTTP-Code: 401'), { code: 401, body: { message: 'Authentication credentials not found' } });
    },
  });
  await assert.rejects(createHubSpotService(client).syncLeadToHubSpot(lead), (err) => {
    assert.ok(err instanceof HubSpotError);
    assert.equal(err.status, 401);
    assert.match(err.message, /HTTP 401/);
    return true;
  });
});

test('rejects a lead without an email', async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(createHubSpotService(client).syncLeadToHubSpot({ firstname: 'x' }), HubSpotError);
  assert.equal(calls.search.length, 0);
});
