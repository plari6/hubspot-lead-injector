'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLead, normalizePhone } = require('../src/validation');
const samples = require('../data/sample-lead.json');

test('accepts a full valid lead and normalizes it', () => {
  const result = validateLead(samples.valid);
  assert.equal(result.valid, true);
  assert.deepEqual(result.lead, {
    email: 'jane.doe@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
    phone: '+15551234567',
    company: 'Acme Corp',
    jobtitle: 'Head of Operations',
    website: 'https://acme.example.com',
  });
});

test('accepts a minimal lead', () => {
  const result = validateLead(samples.minimal);
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(result.lead).sort(), ['email', 'firstname', 'lastname']);
});

test('rejects an invalid email', () => {
  const result = validateLead(samples.invalidEmail);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((e) => e.field), ['email']);
});

test('rejects missing first and last name', () => {
  const result = validateLead(samples.missingNames);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((e) => e.field), ['firstname', 'lastname']);
});

test('rejects whitespace-only names', () => {
  const result = validateLead({ email: 'a@b.co', firstname: '   ', lastname: 'X' });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((e) => e.field), ['firstname']);
});

test('rejects an invalid phone', () => {
  const result = validateLead(samples.invalidPhone);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((e) => e.field), ['phone']);
});

test('rejects non-object bodies', () => {
  for (const body of [null, undefined, 'text', 42, []]) {
    assert.equal(validateLead(body).valid, false);
  }
});

test('rejects wrong field types instead of crashing', () => {
  const result = validateLead({ email: 'a@b.co', firstname: { x: 1 }, lastname: 'X', company: ['y'] });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((e) => e.field).sort(), ['company', 'firstname']);
});

test('ignores unknown fields so they never reach HubSpot', () => {
  const result = validateLead({ ...samples.minimal, hs_object_id: '999', isAdmin: true });
  assert.equal(result.valid, true);
  assert.equal('hs_object_id' in result.lead, false);
  assert.equal('isAdmin' in result.lead, false);
});

test('rejects an invalid website', () => {
  const result = validateLead({ ...samples.minimal, website: 'not a url' });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((e) => e.field), ['website']);
});

test('normalizePhone cleans common formats', () => {
  assert.equal(normalizePhone('+1 (555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('0044 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('555.123.4567'), '5551234567');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('1234567890123456'), null);
});
