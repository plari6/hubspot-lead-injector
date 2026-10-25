'use strict';

const validator = require('validator');

// Optional fields forwarded to HubSpot (all are standard HubSpot contact properties).
const OPTIONAL_FIELDS = ['company', 'jobtitle', 'website', 'city', 'state', 'country', 'lifecyclestage'];
const MAX_FIELD_LENGTH = 255;

/** Returns a trimmed string, '' when missing, or null when the value has the wrong type. */
function asTrimmedString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return String(value).trim();
}

/**
 * Cleans a phone number: keeps a leading "+" and digits only ("00" prefix becomes "+").
 * Returns null when the result is not a plausible phone number (7-15 digits, per E.164).
 */
function normalizePhone(raw) {
  const str = String(raw).trim();
  const international = str.startsWith('+') || str.startsWith('00');
  let digits = str.replace(/\D/g, '');
  if (!str.startsWith('+') && str.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 7 || digits.length > 15) return null;
  return (international ? '+' : '') + digits;
}

/**
 * Validates and normalizes an incoming lead payload.
 * @returns {{ valid: true, lead: object } | { valid: false, errors: {field: string, message: string}[] }}
 */
function validateLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const errors = [];
  const lead = {};

  // Email (required)
  const email = asTrimmedString(body.email);
  if (!email) {
    errors.push({ field: 'email', message: 'email is required' });
  } else if (!validator.isEmail(email)) {
    errors.push({ field: 'email', message: 'email must be a valid email address' });
  } else {
    lead.email = email.toLowerCase();
  }

  // First and last name (required)
  for (const field of ['firstname', 'lastname']) {
    const value = asTrimmedString(body[field]);
    if (!value) {
      errors.push({ field, message: `${field} is required` });
    } else if (value.length > MAX_FIELD_LENGTH) {
      errors.push({ field, message: `${field} must be at most ${MAX_FIELD_LENGTH} characters` });
    } else {
      lead[field] = value;
    }
  }

  // Phone (optional, must be valid if present)
  const phone = asTrimmedString(body.phone);
  if (phone === null) {
    errors.push({ field: 'phone', message: 'phone must be a string' });
  } else if (phone) {
    const cleaned = normalizePhone(phone);
    if (cleaned) lead.phone = cleaned;
    else errors.push({ field: 'phone', message: 'phone must contain 7 to 15 digits' });
  }

  // Other optional passthrough fields
  for (const field of OPTIONAL_FIELDS) {
    const value = asTrimmedString(body[field]);
    if (value === null) {
      errors.push({ field, message: `${field} must be a string` });
    } else if (value.length > MAX_FIELD_LENGTH) {
      errors.push({ field, message: `${field} must be at most ${MAX_FIELD_LENGTH} characters` });
    } else if (field === 'website' && value && !validator.isURL(value)) {
      errors.push({ field, message: 'website must be a valid URL' });
    } else if (value) {
      lead[field] = value;
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true, lead };
}

module.exports = { validateLead, normalizePhone, OPTIONAL_FIELDS };
