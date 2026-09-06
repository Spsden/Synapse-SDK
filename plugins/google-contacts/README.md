# Google Contacts Plugin for Synapse

Manage and search your address book with Google People API v1.

## Actions

- **`create_contact`**: Add new contacts with names, email addresses, phone numbers, and organizations.
- **`search_contacts`**: Search address book by name, email, or phone.
- **`list_contacts`**: Retrieve contacts from your address book.

## OAuth Configuration

- **Provider:** `google-contacts`
- **Alias:** `google_contacts`
- **Scopes:**
  - `https://www.googleapis.com/auth/contacts`
  - `https://www.googleapis.com/auth/contacts.readonly`

## Local Testing

Set in `.env`:
```bash
SYNAPSE_CONNECTION_GOOGLE_CONTACTS=ya29.a0A...
```

Run CLI:
```bash
node cli/dist/index.js run create_contact --dir plugins/google-contacts --text "Add Jane Doe jane@example.com"
node cli/dist/index.js run search_contacts --dir plugins/google-contacts --text "Jane"
```

