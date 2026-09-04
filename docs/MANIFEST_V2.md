# Synapse Plugin Manifest v2

Manifest v2 makes actions the unit of execution and permission review.

Each action declares:

- trigger names and input/output schemas
- named user connections for direct OAuth/API-key integrations
- package-owned hosted MCP servers and exact tool allowlists
- host capabilities and network domains
- supported platforms

MCP is hosted-only. A package declares each remote HTTPS Streamable HTTP
endpoint in `mcp.servers`; actions refer to it by `serverId` and list the only
tools they may call. Synapse connects directly to that endpoint.

For example:

```json
{
  "mcp": {
    "servers": [
      {
        "id": "notion",
        "endpoint": "https://mcp.notion.com/mcp",
        "authentication": "oauth"
      }
    ]
  }
}
```

Only hosted HTTPS MCP endpoints are accepted. Plugin packages cannot declare
commands, environment variables, local sockets, stdio, or local/cloud routing.
The host owns OAuth UI and secure token storage, so tokens are never exposed to
plugin JavaScript.

Plugins do not need MCP for every integration. Actions may use named OAuth or
API-key connections, direct allowlisted network calls, and host capabilities
such as calendar or shortcuts alongside MCP requirements.

An action that calls `synapse.prompt()` declares
`{ "kind": "host", "capability": "com.synapse.prompt" }`. Tool approval then
covers follow-up questions for that invocation; Synapse renders each question
as native conversation UI without a second permission dialog.

Manifest v2 is the only supported plugin contract. `manifestVersion` and
`actions` are required. Legacy top-level `triggers`, `inputSchema`, `auth`, and
`mcpServers` fields are rejected by both validation and packaging.

The canonical example is [`plugins/notion`](../plugins/notion), which declares
the official hosted Notion MCP server and uses MCP OAuth.
