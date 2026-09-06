// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

/**
 * =============================================================================
 * Google Contacts Plugin for Synapse (Manifest v2)
 * =============================================================================
 * Integrates directly with Google People REST API v1:
 * - create_contact: Add new entries with name, email, phone, and organization
 * - search_contacts: Search address book by name, email, or phone
 * - list_contacts: Browse saved contacts and connections
 */

const PEOPLE_BASE = 'https://people.googleapis.com/v1';

// =============================================================================
// Action Registrations
// =============================================================================

for (const trigger of ['create_contact', 'add_contact', 'save_contact', 'new_contact']) {
  synapse.register(trigger, createContact);
}

for (const trigger of ['search_contacts', 'find_contact', 'lookup_contact']) {
  synapse.register(trigger, searchContacts);
}

for (const trigger of ['list_contacts', 'get_contacts', 'show_contacts']) {
  synapse.register(trigger, listContacts);
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Creates a new contact in Google Contacts.
 *
 * @param {SynapseContext} ctx
 */
async function createContact(ctx) {
  try {
    await ensureContactsConnection();

    const entities = extractEntities(ctx);
    let fullName = normalizeString(entities.name) || normalizeString(entities.fullName);
    let givenName = normalizeString(entities.givenName) || normalizeString(entities.firstName);
    let familyName = normalizeString(entities.familyName) || normalizeString(entities.lastName);

    // If full name is provided, parse it if givenName/familyName are empty
    if (fullName && !givenName && !familyName) {
      const parts = fullName.split(/\s+/);
      givenName = parts[0];
      familyName = parts.slice(1).join(' ') || '';
    }

    // Prompt for name if missing
    if (!givenName && !fullName) {
      const namePrompt = await synapse.prompt({
        message: 'Enter contact name:',
        fields: [
          { name: 'givenName', type: 'text', label: 'First Name', required: true },
          { name: 'familyName', type: 'text', label: 'Last Name (optional)' },
        ],
      });
      if (namePrompt.cancelled || !namePrompt.values?.givenName) {
        return synapse.fail({ reason: 'cancelled', message: 'Contact creation cancelled: missing name.' });
      }
      givenName = namePrompt.values.givenName.trim();
      familyName = namePrompt.values.familyName?.trim() || '';
    }

    const email = normalizeString(entities.email);
    const phone = normalizeString(entities.phone) || normalizeString(entities.phoneNumber);
    const company = normalizeString(entities.company) || normalizeString(entities.organization);
    const jobTitle = normalizeString(entities.jobTitle) || normalizeString(entities.role);

    const contactPayload = {
      names: [
        {
          givenName: givenName || 'New',
          familyName: familyName || '',
        },
      ],
      ...(email ? { emailAddresses: [{ value: email, type: 'work' }] } : {}),
      ...(phone ? { phoneNumbers: [{ value: phone, type: 'mobile' }] } : {}),
      ...(company || jobTitle ? { organizations: [{ name: company || '', title: jobTitle || '' }] } : {}),
    };

    const res = await synapse.fetch(`${PEOPLE_BASE}/people:createContact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      connection: 'google_contacts',
      body: JSON.stringify(contactPayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Google People API error (${res.status})`,
      });
    }

    const data = await res.json();
    const displayName = `${givenName} ${familyName}`.trim();

    return synapse.success({
      resourceName: data.resourceName,
      name: displayName,
      email: email || '',
      phone: phone || '',
      message: `Created contact "${displayName}" in Google Contacts.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Searches contacts by query term.
 *
 * @param {SynapseContext} ctx
 */
async function searchContacts(ctx) {
  try {
    await ensureContactsConnection();

    const entities = extractEntities(ctx);
    let query = normalizeString(entities.query) || normalizeString(ctx.input?.text);

    if (!query) {
      const promptRes = await synapse.prompt({
        message: 'Enter contact name or email to search for:',
        fields: [{ name: 'query', type: 'text', label: 'Search Query', required: true }],
      });
      if (promptRes.cancelled || !promptRes.values?.query) {
        return synapse.fail({ reason: 'cancelled', message: 'Search cancelled: missing query.' });
      }
      query = promptRes.values.query.trim();
    }

    const pageSize = entities.pageSize ? Number(entities.pageSize) : 10;
    const queryParams = toQueryString({
      query,
      readMask: 'names,emailAddresses,phoneNumbers,organizations',
      pageSize: String(pageSize),
    });

    const res = await synapse.fetch(`${PEOPLE_BASE}/people:searchContacts${queryParams}`, {
      method: 'GET',
      connection: 'google_contacts',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Contact search failed (${res.status})`,
      });
    }

    const data = await res.json();
    const rawResults = Array.isArray(data.results) ? data.results : [];

    const contacts = rawResults.map((r) => formatPerson(r.person || r));

    return synapse.success({
      query,
      count: contacts.length,
      contacts,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Lists contacts from Google Contacts address book.
 *
 * @param {SynapseContext} ctx
 */
async function listContacts(ctx) {
  try {
    await ensureContactsConnection();

    const entities = extractEntities(ctx);
    const pageSize = entities.pageSize ? Number(entities.pageSize) : 10;
    const queryParams = toQueryString({
      pageSize: String(pageSize),
      personFields: 'names,emailAddresses,phoneNumbers,organizations',
    });

    const res = await synapse.fetch(`${PEOPLE_BASE}/people/me/connections${queryParams}`, {
      method: 'GET',
      connection: 'google_contacts',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to list contacts (${res.status})`,
      });
    }

    const data = await res.json();
    const connections = Array.isArray(data.connections) ? data.connections : [];
    const contacts = connections.map(formatPerson);

    return synapse.success({
      count: contacts.length,
      contacts,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function ensureContactsConnection() {
  if (await synapse.connections.isConnected('google_contacts')) return;
  await synapse.connections.connect('google_contacts');
  if (!(await synapse.connections.isConnected('google_contacts'))) {
    throw new Error('Google Contacts connection was not completed.');
  }
}

function formatPerson(person) {
  const nameObj = person?.names?.[0];
  const name = nameObj?.displayName || `${nameObj?.givenName || ''} ${nameObj?.familyName || ''}`.trim() || 'Unnamed';
  const email = person?.emailAddresses?.[0]?.value || '';
  const phone = person?.phoneNumbers?.[0]?.value || '';
  const company = person?.organizations?.[0]?.name || '';

  return {
    resourceName: person?.resourceName || '',
    name,
    email,
    phone,
    company,
  };
}

function extractEntities(ctx) {
  const llmEntities = ctx.llm?.entities;
  if (llmEntities && typeof llmEntities === 'object') {
    if (llmEntities.entities && typeof llmEntities.entities === 'object') return llmEntities.entities;
    if (llmEntities.llm?.entities && typeof llmEntities.llm.entities === 'object') return llmEntities.llm.entities;
    return llmEntities;
  }
  if (ctx.input && typeof ctx.input === 'object' && ctx.input.input) return ctx.input.input;
  return ctx.input || {};
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function handleExecutionError(error) {
  return synapse.fail({
    reason: 'execution_error',
    message: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Encodes an object into a URL query string without external dependencies.
 * @param {Record<string, string | number | boolean | undefined | null>} params
 * @returns {string}
 */
function toQueryString(params) {
  const parts = [];
  for (const key of Object.keys(params)) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

