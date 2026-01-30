# Google Keep

A Synapse plugin.

## Installation

```bash
synapse package .
```

This will create a `.synx` file that can be installed in Synapse.

## Triggers

- `my_action` - Main action trigger

## Development

Edit `plugin.js` to implement your plugin logic.

The Synapse SDK provides:
- `synapse.fetch()` - Make HTTP requests
- `synapse.storage.get/set()` - Store plugin data
- `synapse.ui.toast()` - Show toast messages
- `synapse.auth.authenticate()` - OAuth authentication
