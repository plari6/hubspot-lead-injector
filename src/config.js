'use strict';

require('dotenv').config({ quiet: true });

const PLACEHOLDER_TOKEN = 'your_private_app_access_token_here';

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const config = Object.freeze({
  port: toInt(process.env.PORT, 3000),
  hubspotAccessToken: (process.env.HUBSPOT_ACCESS_TOKEN || '').trim(),
  // Optional shared secret. When set, callers must send it in the "x-api-key" header.
  webhookSecret: (process.env.WEBHOOK_SECRET || '').trim(),
});

/** True when a real HubSpot token has been configured (not empty, not the placeholder). */
function hasHubSpotToken() {
  return Boolean(config.hubspotAccessToken) && config.hubspotAccessToken !== PLACEHOLDER_TOKEN;
}

module.exports = { config, hasHubSpotToken };
