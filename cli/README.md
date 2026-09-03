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
- `manifest.json` — Plugin metadata with `$schema` for autocomplete
- `plugin.js` — Annotated starter code with SDK quick reference
- `jsconfig.json` — Editor config for IntelliSense
- `synapse-global.d.ts` — SDK type definitions (copied from SDK)
- `README.md` — Plugin documentation
- `.vscode/settings.json` — VS Code settings

### Authenticated Requests

Plugins should never access OAuth tokens directly. Use the `connection`
option on `synapse.fetch` to have the host inject the Authorization header.

```javascript
// Using manifest v2 connections (recommended)
const res = await synapse.fetch('https://api.example.com/data', {
  method: 'GET',
  connection: 'my_connection'  // Alias declared in manifest.json
});

// Using legacy provider (deprecated)
const res = await synapse.fetch('https://api.example.com/data', {
  method: 'GET',
  provider: 'notion'
});
```

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
- Manifest schema validation (patterns, enums, required fields)
- Content hash integrity
- Connection aliases, types, and uniqueness
- Action ids, triggers, and uniqueness
- Requirements (connection, mcp, host, network)
- Config field validation
- Categories and keywords

### Inspect a Package

View details about a packaged plugin:

```bash
synapse info my-plugin.synx
```

## .synx Format

A `.synx` file is a standard ZIP archive containing:

1. **`manifest.json`**: Metadata, permissions, and configuration.
2. **`plugin.js`**: The pure JavaScript code for the plugin.
3. **`icon.png`** (Optional): A 128x128px icon.
4. **`README.md`** (Optional): Markdown documentation.

## SDK Quick Reference

```javascript
// Intent handling
synapse.register('intent_name', async (ctx) => { ... });
synapse.success({ data });
synapse.fail({ reason: '...', message: '...' });
synapse.log('debug message');

// Network (all requests proxied through host)
const res = await synapse.fetch(url, { method, headers, body, connection: 'alias' });
await res.json();
await res.text();
res.ok / res.status / res.statusText

// Structured prompts (declarative — host renders on current surface)
const answer = await synapse.prompt({
  message: 'Which playlist?',
  fields: [{ name: 'playlist', type: 'select', label: 'Playlist', options: [...] }]
});
if (!answer.cancelled) console.log(answer.values.playlist);

// UI (explicit HTML — best for share-capture flows)
const result = await synapse.ui.show(html, { title, width, height });
await synapse.ui.toast('message');
const yes = await synapse.ui.confirm('question?');

// Connections (host-managed OAuth, API keys, and MCP OAuth)
await synapse.connections.connect('alias');
await synapse.connections.isConnected('alias');
await synapse.connections.disconnect('alias');

// Storage (persistent, per-plugin)
await synapse.storage.set('key', value);
const val = await synapse.storage.get('key');
await synapse.storage.delete('key');

// Config (encrypted settings from manifest.json)
const apiKey = await synapse.config.get('key');

// System (platform-specific)
const platform = await synapse.system.platform();
await synapse.system.runShortcut('name', input);          // iOS/macOS
await synapse.system.sendIntent({ action, extras });      // Android
await synapse.system.runAppleScript('tell app ...');      // macOS (requires 'applescript' permission)
await synapse.system.calendar.getEvents({ startDate, endDate }); // iOS/macOS (requires 'calendar' permission)
await synapse.system.calendar.createEvent({ title, startDate, endDate });

// MCP (Model Context Protocol — host-managed tool servers)
const result = await synapse.mcp.callTool('server-name', 'tool-name', { arg: value });
if (result.success) {
  console.log(result.data);   // typed as TResponse
} else {
  console.error(result.error, result.code);  // e.g. 'BRIDGE_ERROR'
}

// File uploads
await synapse.upload({ fileRef, url });
```

## Manifest Schema

The `manifest.json` follows a v2 schema. Key sections:

- **security**: `allowedDomains`, `permissions`, `allowedApps`, `contentHash`
- **connections**: Named user connections (oauth2, api_key, mcp_oauth, none)
- **config**: User-configurable settings (text, password, number, boolean, select)
- **actions**: Intent triggers, input/output schemas, and capability requirements
- **categories**: Marketplace categories (productivity, communication, etc.)
- **keywords**: Search keywords for discovery (max 10)

See `schemas/manifest.schema.json` for the full schema.

## Security

When packaging, the CLI calculates a **SHA-256 hash** of `plugin.js` and stores it in `manifest.json`. The host application verifies this hash before loading the plugin to prevent tampering.
