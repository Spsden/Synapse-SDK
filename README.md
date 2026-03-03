# Synapse SDK

The **Synapse SDK** enables an extensible plugin architecture for the Synapse app — an intelligent action router that turns captured information (screenshots, links, text) into automated actions.

## Overview

- **JS SDK** (`/src`): TypeScript library for building plugins
- **Flutter Host** (`/flutter_example`): Reference implementation for Flutter apps

---

## 📦 For Plugin Developers

### Installation
```bash
npm install @synapse/sdk
```

### Core Concepts

Plugins register **intent handlers** that process user actions. The host application:
1. Captures content (image, text, URL)
2. Uses AI to detect intent and extract entities
3. Dispatches to the appropriate plugin
4. Plugin executes the action (API calls, etc.)

### Basic Plugin

```javascript
import { synapse } from '@synapse/sdk';

synapse.register('create_event', async (ctx) => {
  // ctx.input  - The shared content
  // ctx.llm    - AI analysis (intent, entities)
  // ctx.user   - User context (locale, timezone)
  
  const { title, time } = ctx.llm.entities;
  
  // Make API request
  const res = await synapse.fetch('https://api.example.com/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, time })
  });
  
  if (res.ok) {
    const data = await res.json();
    return synapse.success({ eventId: data.id });
  }
  
  return synapse.fail({ reason: 'api_error', message: 'Failed to create event' });
});
```

---

## API Reference

### `synapse.register(intent, handler)`

Register a handler for an intent.

```javascript
synapse.register('my_intent', async (ctx) => {
  // Handle the intent
  return synapse.success({ result: '...' });
});
```

### `synapse.fetch(url, init?)`

Make HTTP requests. Mirrors the browser `fetch()` API.

```javascript
// GET
const res = await synapse.fetch('https://api.example.com/data');
const data = await res.json();

// POST
const res = await synapse.fetch('https://api.example.com/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test' })
});

// Response properties
res.ok         // true if 200-299
res.status     // HTTP status code
res.statusText // Status text
res.headers    // Response headers
await res.json()  // Parse as JSON
await res.text()  // Get as text
```

### `synapse.ui`

Display custom UI to users.

```javascript
// Show HTML interface
const result = await synapse.ui.show(`
  <button onclick="SynapseBridge.postMessage({selected: 'A'})">
    Option A
  </button>
`, { title: 'Select Option' });

// Toast message
await synapse.ui.toast('Action completed!');

// Confirmation dialog
const confirmed = await synapse.ui.confirm('Delete this item?');
```

### `synapse.auth`

Host-managed authentication. OAuth flows are handled natively.

```javascript
// Check if authenticated
const isAuth = await synapse.auth.isAuthenticated('jira');

// Trigger OAuth flow
if (!isAuth) {
  await synapse.auth.authenticate('jira');
}

// Subsequent requests can pass provider to synapse.fetch

// Logout
await synapse.auth.logout('jira');
```
 
### Authenticated Requests

Access tokens are never exposed to plugins. Use the `provider` option
in `synapse.fetch` or `synapse.upload` to have the host inject the
Authorization header.

```javascript
const res = await synapse.fetch('https://api.example.com/data', {
  provider: 'google'
});
```

### `synapse.storage`

Persistent key-value storage (per-plugin).

```javascript
// Store data
await synapse.storage.set('defaultProject', 'PROJ-1');
await synapse.storage.set('settings', { theme: 'dark' });

// Retrieve
const project = await synapse.storage.get('defaultProject');

// Delete
await synapse.storage.delete('defaultProject');

// Clear all
await synapse.storage.clear();
```

### `synapse.upload(params)`

Upload files captured by the host.

```javascript
const result = await synapse.upload({
  fileRef: ctx.input.imageRef,  // blob://...
  url: 'https://api.example.com/attachments',
  fieldName: 'file',
  formFields: { ticketId: 'PROJ-123' }
});

if (result.success) {
  console.log('Uploaded!', result.response);
}
```

### Result Helpers

```javascript
// Success
return synapse.success({ 
  id: '123',
  link: 'https://app.example.com/item/123'  // Deep link to open
});

// Failure
return synapse.fail({
  reason: 'validation_error',
  message: 'Title is required',
  retryable: true
});
```

---

## Context Object

When a handler is called, it receives a context object:

```typescript
interface SynapseContext {
  input: {
    type: 'image' | 'text' | 'url' | 'file' | 'mixed';
    text?: string;        // OCR/extracted text
    imageRef?: string;    // blob:// reference for uploads
    url?: string;         // Shared URL
    sourceApp?: string;   // Source app bundle ID
  };
  llm: {
    intent: string;              // Detected intent
    entities: Record<string, any>; // Extracted parameters
    confidence?: number;         // 0-1 confidence score
  };
  user?: {
    locale?: string;
    timezone?: string;
  };
}
```

---

## 📱 For Host Developers (Flutter)

### Setup

1. Add dependencies to `pubspec.yaml`:
```yaml
dependencies:
  flutter_js: ^0.8.5
  http: ^1.6.0
```

2. Load SDK and plugins:
```dart
final host = SynapseHost();
await host.init();

// Load SDK bundle
final sdk = await rootBundle.loadString('assets/synapse.global.js');
await host.loadSdk(sdk);

// Load plugin
await host.loadPlugin(pluginCode, pluginId: 'my_plugin');

// Set up callbacks
host.onStatusChanged = (status, data) {
  print('Plugin finished: $data');
};

host.onToast = (message, duration) {
  // Show toast
};

host.onConfirm = (message, confirm, cancel) async {
  // Show dialog, return true/false
};

host.onAuthCheck = (provider) async {
  // Return true if authenticated
};

host.onAuthRequest = (provider) async {
  // Open OAuth flow, return true on success
};

// Dispatch intent
await host.dispatch('create_event', {
  'input': {'type': 'text', 'text': 'Meeting tomorrow'},
  'llm': {'intent': 'create_event', 'entities': {'title': 'Meeting'}},
});
```

See [`flutter_example/lib/synapse_host.dart`](flutter_example/lib/synapse_host.dart) for the complete implementation.

---

## Build

```bash
npm install
npm run build
```

Output: `dist/synapse.global.js` — copy this to your Flutter assets.

---

## 🛠️ CLI Tools

# Synapse CLI

The Synapse CLI tool helps developers create, package, and validate plugins for the Synapse ecosystem.

## Installation

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Link globally (optional)
npm link
```

## Usage

### Initialize a Plugin

Create a new plugin project with standard structure:

```bash
# Create in current directory
synapse init "My Plugin"

# Create in specific directory
synapse init "My Plugin" --dir ./plugins/my-plugin
```

This creates:
- `manifest.json` — Plugin metadata
- `plugin.js` — Plugin code
- `README.md` — Documentation

### Package a Plugin

Bundle your plugin into a `.synx` file for distribution:

```bash
synapse package ./my-plugin -o my-plugin.synx
```

This validates the plugin structure and calculates a content hash for the script to ensure integrity.

### Validate a Package

Verify a plugin directory or `.synx` file:

```bash
# Validate a directory
synapse validate ./my-plugin

# Validate a package file
synapse validate my-plugin.synx
```

This checks:
- Required files (`manifest.json`, `plugin.js`)
- Manifest schema validation
- Content hash integrity

### Inspect a Package

View details about a packaged plugin:

```bash
synapse info my-plugin.synx
```

## .synx Format

A `.synx` file is a standard ZIP archive containing:

1.  **`manifest.json`**: Metadata, permissions, and configuration.
2.  **`plugin.js`**: The pure JavaScript code for the plugin.
3.  **`icon.png`** (Optional): A 128x128px icon.
4.  **`README.md`** (Optional): Markdown documentation.

## Security

When packaging, the CLI calculates a **SHA-256 hash** of `plugin.js` and stores it in `manifest.json`. The host application verifies this hash before loading the plugin to prevent tampering.
