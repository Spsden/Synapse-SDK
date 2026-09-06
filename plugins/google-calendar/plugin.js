// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

/**
 * =============================================================================
 * Google Calendar Plugin for Synapse (Manifest v2)
 * =============================================================================
 * Integrates directly with Google Calendar v3 REST API:
 * - create_event: Schedule structured meetings with time, location, and attendees
 * - list_events: Query upcoming schedule with search/date filters
 * - quick_add_event: Natural language event creation (Google QuickAdd)
 * - delete_event: Cancel meetings with interactive event selection
 */

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

// =============================================================================
// Action Registrations
// =============================================================================

for (const trigger of ['create_event', 'add_to_calendar', 'schedule_meeting', 'new_calendar_event']) {
  synapse.register(trigger, createEvent);
}

for (const trigger of ['list_events', 'get_calendar_events', 'upcoming_events', 'show_schedule']) {
  synapse.register(trigger, listEvents);
}

for (const trigger of ['quick_add_event', 'quick_schedule', 'fast_calendar_add']) {
  synapse.register(trigger, quickAddEvent);
}

for (const trigger of ['delete_event', 'cancel_meeting', 'remove_event']) {
  synapse.register(trigger, deleteEvent);
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Creates a new calendar event.
 *
 * @param {SynapseContext} ctx
 */
async function createEvent(ctx) {
  try {
    await ensureCalendarConnection();

    const entities = extractEntities(ctx);
    let title = normalizeString(entities.title) || inferTitle(entities.text) || inferTitle(ctx.input?.text);

    // Prompt for title if missing
    if (!title) {
      const titlePrompt = await synapse.prompt({
        message: 'Enter event title or meeting name:',
        fields: [{ name: 'title', type: 'text', label: 'Event Title', required: true }],
      });
      if (titlePrompt.cancelled || !titlePrompt.values?.title) {
        return synapse.fail({ reason: 'cancelled', message: 'Event creation cancelled: missing title.' });
      }
      title = titlePrompt.values.title.trim();
    }

    let startTime = normalizeString(entities.startTime) || normalizeString(entities.start);
    let endTime = normalizeString(entities.endTime) || normalizeString(entities.end);

    // If no start time is specified, default to the start of the next hour
    if (!startTime) {
      const defaultStart = getNextHourDate();
      startTime = defaultStart.toISOString();
    }

    // Default end time to 1 hour after start time if not provided
    if (!endTime) {
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      endTime = endDate.toISOString();
    }

    const description = normalizeString(entities.description) || normalizeString(entities.notes) || '';
    const location = normalizeString(entities.location) || '';
    const calendarId = encodeURIComponent(normalizeString(entities.calendarId) || 'primary');

    /** @type {Array<{ email: string }>} */
    let attendees = [];
    if (Array.isArray(entities.attendees)) {
      attendees = entities.attendees.map((a) => (typeof a === 'string' ? { email: a } : a)).filter((a) => a?.email);
    }

    const eventPayload = {
      summary: title,
      description,
      location,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      ...(attendees.length > 0 ? { attendees } : {}),
    };

    const res = await synapse.fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      connection: 'google_calendar',
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Google Calendar API error (${res.status})`,
      });
    }

    const data = await res.json();
    return synapse.success({
      id: data.id,
      title: data.summary || title,
      startTime: data.start?.dateTime || startTime,
      endTime: data.end?.dateTime || endTime,
      link: data.htmlLink || `https://calendar.google.com/calendar/event?eid=${data.id}`,
      message: `Scheduled "${title}" in Google Calendar.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Lists upcoming calendar events.
 *
 * @param {SynapseContext} ctx
 */
async function listEvents(ctx) {
  try {
    await ensureCalendarConnection();

    const entities = extractEntities(ctx);
    const calendarId = encodeURIComponent(normalizeString(entities.calendarId) || 'primary');
    const timeMin = normalizeString(entities.timeMin) || new Date().toISOString();
    const timeMax = normalizeString(entities.timeMax);
    const query = normalizeString(entities.query) || normalizeString(ctx.input?.text);
    const maxResults = entities.maxResults ? Number(entities.maxResults) : 10;

    const queryParams = toQueryString({
      timeMin,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(maxResults),
      timeMax,
      q: query,
    });

    const res = await synapse.fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events${queryParams}`, {
      method: 'GET',
      connection: 'google_calendar',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to fetch calendar events (${res.status})`,
      });
    }

    const data = await res.json();
    const rawItems = Array.isArray(data.items) ? data.items : [];

    const formattedEvents = rawItems.map((item) => ({
      id: item.id,
      title: item.summary || 'Untitled Event',
      startTime: item.start?.dateTime || item.start?.date || '',
      endTime: item.end?.dateTime || item.end?.date || '',
      location: item.location || '',
      link: item.htmlLink || '',
    }));

    return synapse.success({
      count: formattedEvents.length,
      events: formattedEvents,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Quick-adds an event using Google natural language processing.
 *
 * @param {SynapseContext} ctx
 */
async function quickAddEvent(ctx) {
  try {
    await ensureCalendarConnection();

    const entities = extractEntities(ctx);
    let text = normalizeString(entities.text) || normalizeString(ctx.input?.text);

    if (!text) {
      const promptRes = await synapse.prompt({
        message: 'Describe your event (e.g. "Dinner with Alice at 7pm tomorrow"):',
        fields: [{ name: 'text', type: 'text', label: 'Event Description', required: true }],
      });
      if (promptRes.cancelled || !promptRes.values?.text) {
        return synapse.fail({ reason: 'cancelled', message: 'Quick add cancelled.' });
      }
      text = promptRes.values.text.trim();
    }

    const calendarId = encodeURIComponent(normalizeString(entities.calendarId) || 'primary');
    const queryParams = toQueryString({ text });

    const res = await synapse.fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events/quickAdd${queryParams}`, {
      method: 'POST',
      connection: 'google_calendar',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to quick-add event (${res.status})`,
      });
    }

    const data = await res.json();
    return synapse.success({
      id: data.id,
      title: data.summary || text,
      startTime: data.start?.dateTime || data.start?.date || '',
      link: data.htmlLink || '',
      message: `Added event "${data.summary || text}" to Google Calendar.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Deletes / cancels an event from Google Calendar.
 * Prompts user to select from upcoming events if eventId is not provided.
 *
 * @param {SynapseContext} ctx
 */
async function deleteEvent(ctx) {
  try {
    await ensureCalendarConnection();

    const entities = extractEntities(ctx);
    const calendarId = encodeURIComponent(normalizeString(entities.calendarId) || 'primary');
    let eventId = normalizeString(entities.eventId);

    // If eventId is missing, fetch upcoming events and prompt user
    if (!eventId) {
      const queryParams = toQueryString({
        timeMin: new Date().toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '6',
      });

      const listRes = await synapse.fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events${queryParams}`, {
        method: 'GET',
        connection: 'google_calendar',
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        const items = Array.isArray(listData.items) ? listData.items : [];
        if (items.length > 0) {
          const options = items.map((item) => ({
            value: item.id,
            label: `${item.summary || 'Untitled'} (${(item.start?.dateTime || item.start?.date || '').slice(0, 16)})`,
          }));

          const promptRes = await synapse.prompt({
            message: 'Select an event to cancel:',
            fields: [{ name: 'eventId', type: 'select', label: 'Event', options, required: true }],
          });

          if (!promptRes.cancelled && promptRes.values?.eventId) {
            eventId = promptRes.values.eventId;
          }
        }
      }

      if (!eventId) {
        const textPrompt = await synapse.prompt({
          message: 'Enter the Google Calendar Event ID to delete:',
          fields: [{ name: 'eventId', type: 'text', label: 'Event ID', required: true }],
        });
        if (textPrompt.cancelled || !textPrompt.values?.eventId) {
          return synapse.fail({ reason: 'cancelled', message: 'Delete event cancelled.' });
        }
        eventId = textPrompt.values.eventId.trim();
      }
    }

    const res = await synapse.fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      connection: 'google_calendar',
    });

    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to delete event (${res.status})`,
      });
    }

    return synapse.success({
      eventId,
      message: 'Event deleted from Google Calendar.',
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function ensureCalendarConnection() {
  if (await synapse.connections.isConnected('google_calendar')) return;
  await synapse.connections.connect('google_calendar');
  if (!(await synapse.connections.isConnected('google_calendar'))) {
    throw new Error('Google Calendar connection was not completed.');
  }
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

function getNextHourDate() {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(0, 0, 0);
  return d;
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

