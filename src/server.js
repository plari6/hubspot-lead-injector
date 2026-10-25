'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { config, hasHubSpotToken } = require('./config');
const { validateLead } = require('./validation');
const hubspotService = require('./hubspotService');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Builds the Express app. Dependencies can be overridden (used by tests). */
function createApp({
  syncLead = hubspotService.syncLeadToHubSpot,
  webhookSecret = config.webhookSecret,
  logger = console,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', hubspotConfigured: hasHubSpotToken(), uptimeSeconds: Math.round(process.uptime()) });
  });

  // Optional shared-secret auth, enabled when WEBHOOK_SECRET is set.
  function requireApiKey(req, res, next) {
    if (!webhookSecret || safeEqual(req.get('x-api-key') || '', webhookSecret)) return next();
    return res.status(401).json({ success: false, error: 'Invalid or missing x-api-key header' });
  }

  function validateLeadBody(req, res, next) {
    const result = validateLead(req.body);
    if (!result.valid) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: result.errors });
    }
    req.lead = result.lead;
    return next();
  }

  app.post('/api/leads/inject', requireApiKey, validateLeadBody, async (req, res) => {
    const started = Date.now();
    try {
      const { action, contactId } = await syncLead(req.lead);
      const durationMs = Date.now() - started;
      logger.info(`[lead] ${action} contact ${contactId} (${req.lead.email}) in ${durationMs}ms`);
      return res.status(action === 'created' ? 201 : 200).json({ success: true, action, contactId, durationMs });
    } catch (err) {
      logger.error(`[lead] sync failed for ${req.lead.email}: ${err.message}`);
      const status = err.status === 503 ? 503 : 502;
      return res.status(status).json({ success: false, error: err.message || 'Failed to sync lead to HubSpot' });
    }
  });

  app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));

  // Malformed JSON, oversized bodies and unexpected errors.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Malformed JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'Payload too large' });
    }
    logger.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(config.port, () => {
    console.log(`HubSpot Lead Injector listening on http://localhost:${config.port}`);
    if (!hasHubSpotToken()) {
      console.warn('WARNING: HUBSPOT_ACCESS_TOKEN is not set. Lead sync requests will return 503.');
    }
    if (!config.webhookSecret) {
      console.warn('WARNING: WEBHOOK_SECRET is not set. The webhook accepts unauthenticated requests.');
    }
  });
}

module.exports = { createApp };
