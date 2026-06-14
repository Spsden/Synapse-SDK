# Synapse Plugin Manifest v2

Manifest v2 makes actions the unit of execution and permission review.

Each action declares:

- trigger names and input/output schemas
- named user connections
- MCP server IDs and exact tool allowlists
- host capabilities and network domains
- supported platforms

The plugin package does not declare how an MCP server is installed or hosted.
At runtime, Synapse resolves each MCP `serverId` against the reviewed
Marketplace registry and combines the registry deployment with the action
allowlist.

Manifest v1 remains supported. When `manifestVersion` is omitted, the host
reads legacy `triggers`, `inputSchema`, `auth`, and `mcpServers`.

The canonical example is
[`plugins/notion`](../plugins/notion), which uses an MCP OAuth connection and
the official hosted Notion MCP server.
