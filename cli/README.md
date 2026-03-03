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

### Authenticated Requests

Plugins should never access OAuth tokens directly. Use the `provider`
option on `synapse.fetch` to have the host inject the Authorization header.

```javascript
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
