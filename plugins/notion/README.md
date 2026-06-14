# Notion

Canonical Synapse plugin for creating Notion pages through MCP.

The package declares only user-facing actions, connection requirements, and
the exact MCP tool allowlist. The Marketplace MCP registry independently
supplies the reviewed Notion server transport and deployment metadata.

## Build

```bash
cd /Users/pratap/code/Synapse-SDK
node cli/dist/index.js validate plugins/notion
node cli/dist/index.js package plugins/notion \
  --output dist/plugins/com.synapse.notion-1.0.2.synx
```

## Runtime contract

- Connection alias: `notion`
- MCP server alias and registry ID: `notion`
- Allowed tools: `notion-get-self`, `notion-create-pages`
- Platforms: iOS, Android, macOS, Windows, Linux
