'use strict';

// Sends a sample payload from data/sample-lead.json to a running server.
// Usage: npm run send-sample -- [sampleName]   (default: "valid")

const { config } = require('../src/config');
const samples = require('../data/sample-lead.json');

async function main() {
  const name = process.argv[2] || 'valid';
  const payload = samples[name];
  if (!payload) {
    console.error(`Unknown sample "${name}". Available: ${Object.keys(samples).join(', ')}`);
    process.exit(1);
  }

  const url = process.env.TARGET_URL || `http://localhost:${config.port}/api/leads/inject`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.webhookSecret) headers['x-api-key'] = config.webhookSecret;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  console.log(`POST ${url} -> ${res.status}`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

main().catch((err) => {
  console.error(`Request failed: ${err.message}. Is the server running (npm start)?`);
  process.exit(1);
});
