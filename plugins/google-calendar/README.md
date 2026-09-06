# Google Calendar Plugin for Synapse

Integrate Synapse with Google Calendar to schedule events, list upcoming meetings, use natural language QuickAdd, and cancel meetings.

## Actions

- **`create_event`**: Schedule meetings with date, time, location, notes, and attendee invites.
- **`list_events`**: Retrieve upcoming events with search and time filters.
- **`quick_add_event`**: Fast natural-language event creation (e.g., `"Lunch with Sarah at noon tomorrow"`).
- **`delete_event`**: Cancel an event with interactive event selection.

## OAuth Configuration

- **Provider:** `google-calendar`
- **Alias:** `google_calendar`
- **Scopes:**
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`

## Local Testing

Set in `.env`:
```bash
SYNAPSE_CONNECTION_GOOGLE_CALENDAR=ya29.a0A...
```

Run CLI:
```bash
node cli/dist/index.js run create_event --dir plugins/google-calendar --text "Sprint Planning tomorrow at 10am"
node cli/dist/index.js run list_events --dir plugins/google-calendar
```

