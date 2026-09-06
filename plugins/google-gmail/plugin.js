// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

/**
 * =============================================================================
 * Gmail Plugin for Synapse (Manifest v2)
 * =============================================================================
 * Integrates directly with Gmail REST API v1:
 * - send_email: Compose and transmit RFC 2822 emails
 * - create_draft: Prepare drafts without sending
 * - search_emails: Search inbox by sender, keywords, labels
 * - list_unread_emails: Review incoming unread communications
 */

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// =============================================================================
// Action Registrations
// =============================================================================

for (const trigger of ['send_email', 'send_gmail', 'compose_and_send_email']) {
  synapse.register(trigger, sendEmail);
}

for (const trigger of ['create_draft', 'draft_email', 'save_email_draft']) {
  synapse.register(trigger, createDraft);
}

for (const trigger of ['search_emails', 'search_gmail', 'find_emails']) {
  synapse.register(trigger, searchEmails);
}

for (const trigger of ['list_unread_emails', 'check_inbox', 'get_unread_emails']) {
  synapse.register(trigger, listUnreadEmails);
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Composes and immediately sends an email.
 *
 * @param {SynapseContext} ctx
 */
async function sendEmail(ctx) {
  try {
    await ensureGmailConnection();

    const entities = extractEntities(ctx);
    let to = normalizeString(entities.to) || normalizeString(entities.recipient);
    let subject = normalizeString(entities.subject) || inferTitle(entities.text) || 'No Subject';
    let body = normalizeString(entities.body) || normalizeString(entities.content) || normalizeString(ctx.input?.text) || '';

    // Prompt for recipient if missing
    if (!to) {
      const toPrompt = await synapse.prompt({
        message: 'Enter recipient email address:',
        fields: [{ name: 'to', type: 'text', label: 'To', required: true }],
      });
      if (toPrompt.cancelled || !toPrompt.values?.to) {
        return synapse.fail({ reason: 'cancelled', message: 'Send cancelled: missing recipient.' });
      }
      to = toPrompt.values.to.trim();
    }

    // Prompt for body if missing
    if (!body) {
      const bodyPrompt = await synapse.prompt({
        message: `Enter email message for ${to}:`,
        fields: [
          { name: 'subject', type: 'text', label: 'Subject', defaultValue: subject },
          { name: 'body', type: 'text', label: 'Message Body', required: true },
        ],
      });
      if (bodyPrompt.cancelled || !bodyPrompt.values?.body) {
        return synapse.fail({ reason: 'cancelled', message: 'Send cancelled: empty message body.' });
      }
      subject = bodyPrompt.values.subject?.trim() || subject;
      body = bodyPrompt.values.body.trim();
    }

    const cc = normalizeString(entities.cc);
    const bcc = normalizeString(entities.bcc);

    const rfc2822 = formatRfc2822({ to, subject, body, cc, bcc });
    const rawBase64 = base64UrlEncode(rfc2822);

    const res = await synapse.fetch(`${GMAIL_BASE}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      connection: 'gmail',
      body: JSON.stringify({ raw: rawBase64 }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Gmail API error (${res.status})`,
      });
    }

    const data = await res.json();
    return synapse.success({
      id: data.id,
      threadId: data.threadId,
      to,
      subject,
      message: `Email sent to ${to}.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Creates a draft email without sending it.
 *
 * @param {SynapseContext} ctx
 */
async function createDraft(ctx) {
  try {
    await ensureGmailConnection();

    const entities = extractEntities(ctx);
    let to = normalizeString(entities.to) || normalizeString(entities.recipient) || '';
    let subject = normalizeString(entities.subject) || inferTitle(entities.text) || 'Draft Note';
    let body = normalizeString(entities.body) || normalizeString(entities.content) || normalizeString(ctx.input?.text) || '';

    if (!body) {
      const draftPrompt = await synapse.prompt({
        message: 'Enter draft content:',
        fields: [
          { name: 'to', type: 'text', label: 'To (optional)', defaultValue: to },
          { name: 'subject', type: 'text', label: 'Subject', defaultValue: subject },
          { name: 'body', type: 'text', label: 'Draft Body', required: true },
        ],
      });
      if (draftPrompt.cancelled || !draftPrompt.values?.body) {
        return synapse.fail({ reason: 'cancelled', message: 'Draft creation cancelled.' });
      }
      to = draftPrompt.values.to?.trim() || to;
      subject = draftPrompt.values.subject?.trim() || subject;
      body = draftPrompt.values.body.trim();
    }

    const cc = normalizeString(entities.cc);
    const rfc2822 = formatRfc2822({ to, subject, body, cc });
    const rawBase64 = base64UrlEncode(rfc2822);

    const res = await synapse.fetch(`${GMAIL_BASE}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      connection: 'gmail',
      body: JSON.stringify({ message: { raw: rawBase64 } }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to create Gmail draft (${res.status})`,
      });
    }

    const data = await res.json();
    return synapse.success({
      id: data.id,
      subject,
      message: `Draft "${subject}" created in Gmail.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Searches messages in Gmail matching a search query.
 *
 * @param {SynapseContext} ctx
 */
async function searchEmails(ctx) {
  try {
    await ensureGmailConnection();

    const entities = extractEntities(ctx);
    let query = normalizeString(entities.query) || normalizeString(ctx.input?.text);

    if (!query) {
      const promptRes = await synapse.prompt({
        message: 'Enter search query for Gmail (e.g. "from:boss", "invoice", "meeting"):',
        fields: [{ name: 'query', type: 'text', label: 'Search Query', required: true }],
      });
      if (promptRes.cancelled || !promptRes.values?.query) {
        return synapse.fail({ reason: 'cancelled', message: 'Search cancelled: missing query.' });
      }
      query = promptRes.values.query.trim();
    }

    const maxResults = entities.maxResults ? Number(entities.maxResults) : 10;
    const queryParams = toQueryString({ q: query, maxResults: String(maxResults) });

    const listRes = await synapse.fetch(`${GMAIL_BASE}/messages${queryParams}`, {
      method: 'GET',
      connection: 'gmail',
    });

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Gmail search failed (${listRes.status})`,
      });
    }

    const data = await listRes.json();
    const messageHeaders = Array.isArray(data.messages) ? data.messages : [];

    // Retrieve snippets for top messages (up to 5 concurrently)
    const messages = await fetchSnippets(messageHeaders.slice(0, 5));

    return synapse.success({
      query,
      count: messages.length,
      messages,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Lists unread messages from the user's primary inbox.
 *
 * @param {SynapseContext} ctx
 */
async function listUnreadEmails(ctx) {
  try {
    await ensureGmailConnection();

    const entities = extractEntities(ctx);
    const maxResults = entities.maxResults ? Number(entities.maxResults) : 10;
    const queryParams = toQueryString({
      q: 'is:unread label:INBOX',
      maxResults: String(maxResults),
    });

    const listRes = await synapse.fetch(`${GMAIL_BASE}/messages${queryParams}`, {
      method: 'GET',
      connection: 'gmail',
    });

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to fetch unread emails (${listRes.status})`,
      });
    }

    const data = await listRes.json();
    const messageHeaders = Array.isArray(data.messages) ? data.messages : [];
    const messages = await fetchSnippets(messageHeaders.slice(0, 5));

    return synapse.success({
      count: messages.length,
      messages,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function ensureGmailConnection() {
  if (await synapse.connections.isConnected('gmail')) return;
  await synapse.connections.connect('gmail');
  if (!(await synapse.connections.isConnected('gmail'))) {
    throw new Error('Gmail connection was not completed.');
  }
}

/**
 * Fetches snippets for message stubs.
 *
 * @param {Array<{ id: string, threadId: string }>} stubs
 */
async function fetchSnippets(stubs) {
  const results = [];
  for (const stub of stubs) {
    try {
      const res = await synapse.fetch(`${GMAIL_BASE}/messages/${stub.id}?format=minimal`, {
        method: 'GET',
        connection: 'gmail',
      });
      if (res.ok) {
        const detail = await res.json();
        results.push({
          id: stub.id,
          threadId: stub.threadId,
          snippet: detail.snippet || '',
        });
      }
    } catch {
      results.push({ id: stub.id, threadId: stub.threadId, snippet: '' });
    }
  }
  return results;
}

/**
 * Formats an RFC 2822 email message string.
 */
function formatRfc2822({ to, subject, body, cc, bcc }) {
  const headers = [];
  if (to) headers.push(`To: ${to}`);
  if (subject) headers.push(`Subject: ${subject}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push('Content-Type: text/plain; charset=utf-8');
  headers.push('MIME-Version: 1.0');

  return `${headers.join('\r\n')}\r\n\r\n${body || ''}`;
}

/**
 * URL-safe Base64 encoder without padding (standard RFC 4648 § 5 for Gmail API).
 * Implemented in pure JS so it runs reliably on any runtime (QuickJS, V8, Node).
 */
function base64UrlEncode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const utf8Bytes = [];

  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 128) {
      utf8Bytes.push(c);
    } else if (c < 2048) {
      utf8Bytes.push(192 | (c >> 6));
      utf8Bytes.push(128 | (c & 63));
    } else if (c < 55296 || c >= 57344) {
      utf8Bytes.push(224 | (c >> 12));
      utf8Bytes.push(128 | ((c >> 6) & 63));
      utf8Bytes.push(128 | (c & 63));
    } else {
      i++;
      c = 65536 + (((c & 1023) << 10) | (str.charCodeAt(i) & 1023));
      utf8Bytes.push(240 | (c >> 18));
      utf8Bytes.push(128 | ((c >> 12) & 63));
      utf8Bytes.push(128 | ((c >> 6) & 63));
      utf8Bytes.push(128 | (c & 63));
    }
  }

  let base64 = '';
  let i = 0;
  while (i < utf8Bytes.length) {
    const b1 = utf8Bytes[i++];
    const b2 = i < utf8Bytes.length ? utf8Bytes[i++] : NaN;
    const b3 = i < utf8Bytes.length ? utf8Bytes[i++] : NaN;

    base64 += chars.charAt(b1 >> 2);
    base64 += chars.charAt(((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4));
    if (!isNaN(b2)) {
      base64 += chars.charAt(((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6));
    }
    if (!isNaN(b3)) {
      base64 += chars.charAt(b3 & 63);
    }
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_');
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

function inferTitle(text) {
  if (!text) return null;
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean);
  if (!firstLine) return null;
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77)}...`;
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

