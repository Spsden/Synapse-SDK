# Notion

Canonical Synapse plugin for creating Notion pages through MCP.

The package declares Notion's hosted HTTPS MCP endpoint and the exact tool
allowlist. Synapse establishes the MCP OAuth connection directly; no
Marketplace MCP registry is involved.

## Build

```bash
cd /Users/pratap/code/Synapse-SDK
node cli/dist/index.js validate plugins/notion
node cli/dist/index.js package plugins/notion \
  --output dist/plugins/com.synapse.notion-1.0.3.synx
```

## Runtime contract

- Hosted MCP endpoint: `https://mcp.notion.com/mcp`
- MCP server ID: `notion`
- Authentication: MCP OAuth
- Allowed tools: `notion-create-pages`
- Platforms: iOS, Android, macOS, Windows, Linux
