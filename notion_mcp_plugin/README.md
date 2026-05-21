# Add to Notion (MCP)

A Synapse plugin that creates Notion pages through `synapse.mcp.callTool()`.

## Trigger

- `add_to_notion_mcp`

## Required manifest capability

- `security.permissions` includes `mcp`
- `mcpServers` includes `notion` with allowed tool names

## Config

- `notion_parent_id` (optional)
- `notion_parent_type` (`auto|page|database|data_source`)
- `notion_create_tool` (defaults to `notion-create-pages`)
- `notion_ping_tool` (`notion-get-self|get-self|none`)

## Notes

- This plugin intentionally keeps payloads conservative for initial E2E testing.
- Different Notion MCP servers may use slightly different create-page schemas; use `notion_create_tool` to align with your server implementation.
