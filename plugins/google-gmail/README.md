# Gmail Plugin for Synapse

Send emails, prepare drafts, search message history, and inspect unread mail using the Gmail REST API v1.

## Actions

- **`send_email`**: Compose and transmit emails with subject, body, CC, and BCC.
- **`create_draft`**: Create draft messages in Gmail without sending.
- **`search_emails`**: Search messages and threads with query expressions (`from:`, `is:unread`, keywords).
- **`list_unread_emails`**: Inspect recent unread incoming messages.

## OAuth Configuration

- **Provider:** `google-gmail`
- **Alias:** `gmail`
- **Scopes:**
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.compose`
  - `https://www.googleapis.com/auth/gmail.readonly`

## Local Testing

Set in `.env`:
```bash
SYNAPSE_CONNECTION_GMAIL=ya29.a0A...
```

Run CLI:
```bash
node cli/dist/index.js run send_email --dir plugins/google-gmail --text "Send email to team@example.com about deployment"
node cli/dist/index.js run search_emails --dir plugins/google-gmail --text "from:notifications"
```

