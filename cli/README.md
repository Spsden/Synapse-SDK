# Synapse CLI

The Synapse CLI tool helps developers create, run, test, validate, and package plugins for the Synapse ecosystem.

## Quick Start

```bash
# From the repository root:
cd cli
npm install
npm run build

# Link globally (optional):
npm link
```

## Commands & Usage

### 1. Initialize a Plugin (`synapse init`)

Create a new plugin project pre-configured with full editor superpowers:

```bash
# Using global command (if linked):
synapse init "My Plugin" --dir ../plugins/my-plugin

# Or directly using node:
node dist/index.js init "My Plugin" --dir ../plugins/my-plugin
```

This scaffolds:
- `.synapse/`
  - `manifest.schema.json` — Local copy of the manifest schema for offline autocomplete
  - `synapse-global.d.ts` — Full SDK type definitions with rich JSDoc and hover examples
- `.vscode/`
  - `settings.json` — Schema mapping for `manifest.json`, turns on type checking & quick suggestions
  - `synapse.code-snippets` — Ready-to-use snippets (`syn-handler`, `syn-fetch`, `syn-prompt`, `syn-mcp`, etc.)
- `manifest.json` — Manifest v2 pre-configured with `$schema: "./.synapse/manifest.schema.json"`
- `plugin.js` — Annotated starter code with input validation and inline examples
- `jsconfig.json` — Preconfigured for instant IntelliSense in pure JavaScript
- `README.md` — Plugin documentation and quick cheat sheet

### 2. Test Locally Without an App (`synapse run` / `test`)

Test your plugin logic instantly in a simulated Node.js sandbox:

```bash
# Run with simulated text input
node dist/index.js run my_plugin --dir ../plugins/my-plugin --text "Sample input text"

# Run with URL input
node dist/index.js run my_plugin --dir ../plugins/my-plugin --url "https://example.com"

# Run with custom entities
node dist/index.js run my_plugin --dir ../plugins/my-plugin --text "Buy Milk" -e title="Buy Milk" -e priority=high

# Run on a specific surface (chat or share)
node dist/index.js run my_plugin --dir ../plugins/my-plugin --surface chat
```

#### Features:
- **Interactive Prompts**: If your code calls `synapse.prompt()`, the CLI prompts you interactively in the terminal.
- **Local Credentials via `.env`**: Put `SYNAPSE_CONNECTION_<ALIAS>=secret_token` or `SYNAPSE_CONFIG_<KEY>=value` in a `.env` file in your plugin folder, and `synapse run` will automatically inject them into `synapse.fetch()` and `synapse.config.get()`.
- **Trace Output**: Visual colorized execution logs showing fetch calls, MCP tool invocations, storage operations, and the final `synapse.success` or `synapse.fail` result.

### 3. Authenticated Requests

Plugins should never access OAuth tokens directly. Use the `connection`
option on `synapse.fetch` to have the host inject the Authorization header.

```javascript
// Using manifest v2 connections (recommended)
const res = await synapse.fetch('https://api.example.com/data', {
  method: 'GET',
  connection: 'my_connection'  // Alias declared in manifest.json
});
```

### 4. Package a Plugin (`synapse package`)

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
- **connections**: Named user connections (oauth2, api_key, none). Hosted MCP OAuth is declared by `mcp.servers`.
- **config**: User-configurable settings (text, password, number, boolean, select)
- **actions**: Intent triggers, input/output schemas, and capability requirements
- **categories**: Marketplace categories (productivity, communication, etc.)
- **keywords**: Search keywords for discovery (max 10)

See `schemas/manifest.schema.json` for the full schema.

## Security

When packaging, the CLI calculates a **SHA-256 hash** of `plugin.js` and stores it in `manifest.json`. The host application verifies this hash before loading the plugin to prevent tampering.
