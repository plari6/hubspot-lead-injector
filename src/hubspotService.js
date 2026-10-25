'use strict';

const hubspot = require('@hubspot/api-client');
const { config, hasHubSpotToken } = require('./config');

class HubSpotError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'HubSpotError';
    this.status = status;
    this.cause = cause;
  }
}

function statusOf(err) {
  return err?.code ?? err?.statusCode ?? err?.response?.status;
}

/** On create, HubSpot returns 409 with "Existing ID: 123" if the email already exists. */
function existingIdFromConflict(err) {
  const body = err?.body;
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? err?.message ?? '');
  const match = text.match(/Existing ID:\s*(\d+)/i);
  return match ? match[1] : null;
}

/**
 * Builds a lead-sync service around a HubSpot client.
 * Taking the client as a parameter makes it easy to test with a fake.
 */
function createHubSpotService(client) {
  async function findContactIdByEmail(email) {
    const response = await client.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email', 'firstname', 'lastname'],
      limit: 1,
    });
    return response?.results?.[0]?.id ?? null;
  }

  async function updateContact(contactId, properties) {
    const updated = await client.crm.contacts.basicApi.update(contactId, { properties });
    return { action: 'updated', contactId: String(updated?.id ?? contactId) };
  }

  /**
   * Upserts a lead: search by email, then update if found, otherwise create.
   * @param {{ email: string, firstname: string, lastname: string }} leadData
   * @returns {Promise<{ action: 'created' | 'updated', contactId: string }>}
   */
  async function syncLeadToHubSpot(leadData) {
    if (!leadData?.email) throw new HubSpotError('leadData.email is required', { status: 400 });
    const properties = { ...leadData };

    try {
      const existingId = await findContactIdByEmail(leadData.email);
      if (existingId) return await updateContact(existingId, properties);

      try {
        const created = await client.crm.contacts.basicApi.create({ properties, associations: [] });
        return { action: 'created', contactId: String(created.id) };
      } catch (err) {
        // HubSpot's search index lags a few seconds behind writes, so two quick submissions
        // can both miss the search. If create says the contact exists, update it instead.
        const conflictId = statusOf(err) === 409 ? existingIdFromConflict(err) : null;
        if (conflictId) return await updateContact(conflictId, properties);
        throw err;
      }
    } catch (err) {
      if (err instanceof HubSpotError) throw err;
      const status = statusOf(err);
      throw new HubSpotError(`HubSpot request failed${status ? ` (HTTP ${status})` : ''}`, { status, cause: err });
    }
  }

  return { syncLeadToHubSpot, findContactIdByEmail };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) {
    if (!hasHubSpotToken()) {
      throw new HubSpotError('HUBSPOT_ACCESS_TOKEN is not configured', { status: 503 });
    }
    // Built-in retries handle HubSpot rate limits (429) and transient 5xx errors.
    const client = new hubspot.Client({ accessToken: config.hubspotAccessToken, numberOfApiCallRetries: 3 });
    defaultService = createHubSpotService(client);
  }
  return defaultService;
}

/** Syncs a lead using the token from .env. */
function syncLeadToHubSpot(leadData) {
  return getDefaultService().syncLeadToHubSpot(leadData);
}

module.exports = { syncLeadToHubSpot, createHubSpotService, HubSpotError };
