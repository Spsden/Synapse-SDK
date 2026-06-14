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

The merge is intentionally one-way:

1. The plugin manifest supplies the action, connection alias, server ID, and
   exact tool allowlist.
2. The Marketplace registry supplies reviewed auth profiles, artifacts, and
   platform deployments.
3. The runtime selects a compatible deployment and enforces both allowlists.

Local developer commands are user configuration, not plugin package metadata.
They are loaded by the desktop runtime through `MCP_DEVELOPER_CONFIG_PATH` and
cannot be submitted as Marketplace deployments.

Plugins do not need MCP for every integration. Actions may use named OAuth or
API-key connections, direct allowlisted network calls, and host capabilities
such as calendar or shortcuts alongside MCP requirements.

Manifest v1 remains supported. When `manifestVersion` is omitted, the host
reads legacy `triggers`, `inputSchema`, `auth`, and `mcpServers`.

The canonical example is
[`plugins/notion`](../plugins/notion), which uses an MCP OAuth connection and
the official hosted Notion MCP server.
