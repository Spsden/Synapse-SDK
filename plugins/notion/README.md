# Notion Plugin for Synapse

The comprehensive Notion suite for Synapse, integrating pages, databases, daily notes, quick capture, and workspace search via Notion's official hosted Model Context Protocol (MCP) server.

## Overview

- **Package ID:** `com.synapse.notion`
- **Version:** `2.0.0`
- **Manifest Contract:** Manifest v2
- **MCP Server:** `https://mcp.notion.com/mcp`
- **Authentication:** Hosted OAuth2
- **Capabilities:** Model Context Protocol (`mcp`), Configuration (`config`), Interactive Prompting (`com.synapse.prompt`)
- **Platforms:** iOS, Android, macOS, Windows, Linux

---

## Commands & Actions

### 1. Create Database Page (`create_database_page`)
Create a new entry / row in a Notion database with custom properties and Markdown content. If no database ID is provided, the plugin searches your databases and uses `synapse.prompt()` to let you select the target database interactively.

- **Triggers:** `create_database_page`, `add_database_page`, `new_database_row`, `add_to_database`
- **Inputs:**
  - `title` (*string, required*): Page / task title.
  - `databaseId` (*string, optional*): Target database ID (prompts if omitted).
  - `content` (*string, optional*): Markdown body.
  - `properties` (*object, optional*): Additional database properties (e.g. status, tags).

### 2. Search Notion (`search_notion`)
Search across your entire Notion workspace for databases and pages.

- **Triggers:** `search_notion`, `find_in_notion`, `search_pages`
- **Inputs:**
  - `query` (*string, optional*): Keyword filter.
  - `filter` (*string, optional*): `'database'` or `'page'`.

### 3. Quick Capture (`quick_capture`)
Rapidly capture ideas, links, or OCR text into Notion. Automatically extracts or infers titles and saves to your configured Quick Capture page.

- **Triggers:** `quick_capture`, `capture_to_notion`, `quick_note_capture`
- **Inputs:**
  - `content` (*string, optional*): Text or body to capture.
  - `title` (*string, optional*): Title (inferred from first line if omitted).
  - `parentPageId` (*string, optional*): Target page ID.

### 4. Add Note (`add_note`)
Write a quick note into a daily page inside your notes notebook with a timestamp header (`### HH:MM`).

- **Triggers:** `add_note`, `create_daily_note`, `add_daily_note`, `write_note`
- **Inputs:**
  - `note` (*string, required*): The note content.
  - `title` (*string, optional*): Note heading or title.
  - `date` (*string, optional*): Date in `YYYY-MM-DD` (defaults to today).
  - `notesPageId` (*string, optional*): Parent page ID for notes.

### 5. Add Text to Page (`add_text_to_page`)
Append or prepend text, along with a formatted date header (`**YYYY-MM-DD HH:MM**`), to an existing Notion page.

- **Triggers:** `add_text_to_page`, `append_to_page`, `prepend_to_page`, `append_text`
- **Inputs:**
  - `text` (*string, required*): Text content.
  - `pageId` (*string, optional*): Target page ID (prompts if omitted).
  - `position` (*string, optional*): `'append'` (default) or `'prepend'`.
  - `includeDate` (*boolean, optional*): Whether to include timestamp header (default `true`).

### 6. Create Page (`create_page`)
Create a structured page in Notion with a title and content under a specified parent page.

- **Triggers:** `create_page`, `new_notion_page`, `create_doc`
- **Inputs:**
  - `title` (*string, required*): Page title.
  - `content` (*string, optional*): Markdown body.
  - `parentPageId` (*string, optional*): Parent page ID (prompts if omitted).

### 7. View Page (`view_page`)
Fetch and view the content and properties of a Notion page by ID.

- **Triggers:** `view_page`, `read_notion_page`, `get_page`, `fetch_page`
- **Inputs:**
  - `pageId` (*string, optional*): Page ID to inspect (prompts if omitted).

### 8. List Databases (`list_databases`)
Discover and list all databases available in your Notion workspace.

- **Triggers:** `list_databases`, `list_notion_databases`, `find_databases`
- **Inputs:**
  - `query` (*string, optional*): Search query.

### 9. View Database (`view_database`)
Fetch and inspect the schema and structure of a specific Notion database.

- **Triggers:** `view_database`, `get_database`, `inspect_database`
- **Inputs:**
  - `databaseId` (*string, optional*): Database ID to inspect (prompts if omitted).

### 10. Create Database (`create_database`)
Create a brand new database with a title under an existing page.

- **Triggers:** `create_database`, `new_notion_database`, `add_database`
- **Inputs:**
  - `title` (*string, required*): Database title.
  - `parentPageId` (*string, optional*): Parent page ID (prompts if omitted).

---

## Configuration Settings

You can configure default locations in the Synapse plugin settings UI:

| Key | Type | Description |
| :--- | :--- | :--- |
| `notion_parent_id` | text | Default workspace parent page or database ID. |
| `notion_parent_type` | select | Parent type (`auto`, `page`, `database`, `data_source`). |
| `notion_default_database_id` | text | Default database ID for `create_database_page`. |
| `notion_daily_notes_page_id` | text | Default parent page ID for `add_note`. |
| `notion_quick_capture_page_id` | text | Default page ID for `quick_capture`. |

---

## Validation & Packaging

Verify manifest contracts and package into `.synx`:

```bash
cd /Users/pratap/code/Synapse-SDK

# Validate manifest schema and code contracts
node cli/dist/index.js validate plugins/notion

# Run automated smoke test suite
npm test

# Package bundle for distribution
node cli/dist/index.js package plugins/notion -o dist/plugins/com.synapse.notion-2.0.0.synx
```
