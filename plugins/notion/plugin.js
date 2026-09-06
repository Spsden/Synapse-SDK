// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

/**
 * =============================================================================
 * Notion Plugin for Synapse (Manifest v2)
 * =============================================================================
 * Comprehensive suite for Notion workspace integration via official Notion MCP:
 * - Pages: quick capture, create structured page, view page, append/prepend text, add daily note
 * - Databases: list databases, view database, create database, add database row/page
 * - Search: workspace-wide search across pages and databases
 * - Interactive UX: uses synapse.prompt() to ask the user which page or database
 *   when target IDs are omitted.
 */

// =============================================================================
// Action Registrations
// =============================================================================

// 1. Create Database Page / Entry
for (const trigger of ['create_database_page', 'add_database_page', 'new_database_row', 'add_to_database']) {
  synapse.register(trigger, createDatabasePage);
}

// 2. Create Database
for (const trigger of ['create_database', 'new_notion_database', 'add_database']) {
  synapse.register(trigger, createDatabase);
}

// 3. View Database
for (const trigger of ['view_database', 'get_database', 'inspect_database']) {
  synapse.register(trigger, viewDatabase);
}

// 4. List Databases
for (const trigger of ['list_databases', 'list_notion_databases', 'find_databases']) {
  synapse.register(trigger, listDatabases);
}

// 5. Quick Capture
for (const trigger of ['quick_capture', 'capture_to_notion', 'quick_note_capture']) {
  synapse.register(trigger, quickCapture);
}

// 6. Create Page
for (const trigger of ['create_page', 'new_notion_page', 'create_doc']) {
  synapse.register(trigger, createPage);
}

// 7. View Page
for (const trigger of ['view_page', 'read_notion_page', 'get_page', 'fetch_page']) {
  synapse.register(trigger, viewPage);
}

// 8. Add Text to Page
for (const trigger of ['add_text_to_page', 'append_to_page', 'prepend_to_page', 'append_text']) {
  synapse.register(trigger, addTextToPage);
}

// 9. Add Note (Daily Notes)
for (const trigger of ['add_note', 'create_daily_note', 'add_daily_note', 'write_note']) {
  synapse.register(trigger, addNote);
}

// 10. Search Notion
for (const trigger of ['search_notion', 'find_in_notion', 'search_pages']) {
  synapse.register(trigger, searchNotion);
}

// =============================================================================
// Handlers: Database Operations
// =============================================================================

/**
 * Creates a new page or row inside an existing Notion database.
 * Prompts user for target database if not specified.
 *
 * @param {SynapseContext} ctx
 */
async function createDatabasePage(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let title = normalizeString(entities.title) || inferTitle(entities.text) || inferTitle(ctx.input?.text);

    if (!title) {
      const titlePrompt = await synapse.prompt({
        message: 'Enter a title for the new database entry:',
        fields: [
          {
            name: 'title',
            type: 'text',
            label: 'Page Title',
            required: true,
          },
        ],
      });
      if (titlePrompt.cancelled || !titlePrompt.values?.title) {
        return synapse.fail({ reason: 'cancelled', message: 'Title input was cancelled.' });
      }
      title = titlePrompt.values.title.trim();
    }

    const content = normalizeString(entities.content) || normalizeString(entities.text) || normalizeString(ctx.input?.text) || '';
    let databaseId = normalizeString(entities.databaseId) || normalizeString(await synapse.config.get('notion_default_database_id'));

    // If databaseId is not provided, prompt user to select one
    if (!databaseId) {
      const selectedId = await promptForDatabase('Select target Notion database:');
      if (!selectedId) {
        return synapse.fail({ reason: 'cancelled', message: 'No Notion database selected.' });
      }
      databaseId = selectedId;
    }

    const properties = entities.properties && typeof entities.properties === 'object' ? entities.properties : {};

    // Build tool arguments according to notion-create-pages specification
    const toolArgs = {
      pages: [
        {
          properties: {
            title,
            ...properties,
          },
          ...(content ? { content } : {}),
        },
      ],
      parent: { database_id: databaseId },
    };

    const result = await synapse.mcp.callTool('notion', 'notion-create-pages', toolArgs, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to create entry in Notion database.',
      });
    }

    const createdPage = extractCreatedPageResult(result.data);
    return synapse.success({
      id: createdPage.id,
      title,
      databaseId,
      url: createdPage.url,
      message: `Created "${title}" in Notion database.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Creates a new Notion database under a parent page.
 *
 * @param {SynapseContext} ctx
 */
async function createDatabase(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let title = normalizeString(entities.title) || 'Untitled Database';
    let parentPageId = normalizeString(entities.parentPageId) || normalizeString(await synapse.config.get('notion_parent_id'));

    if (!parentPageId) {
      const selectedParent = await promptForPage('Select parent page for new database:');
      if (!selectedParent) {
        return synapse.fail({ reason: 'cancelled', message: 'Parent page selection cancelled.' });
      }
      parentPageId = selectedParent;
    }

    const toolArgs = {
      title,
      parent: { page_id: parentPageId },
    };

    const result = await synapse.mcp.callTool('notion', 'notion-create-database', toolArgs, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to create Notion database.',
      });
    }

    const databaseId = result.data?.id || 'created';
    const databaseUrl = result.data?.url || `https://notion.so/${databaseId}`;

    return synapse.success({
      id: databaseId,
      title,
      url: databaseUrl,
      message: `Created Notion database "${title}".`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Inspects and retrieves database schema and contents.
 *
 * @param {SynapseContext} ctx
 */
async function viewDatabase(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let databaseId = normalizeString(entities.databaseId) || normalizeString(await synapse.config.get('notion_default_database_id'));

    if (!databaseId) {
      const selectedId = await promptForDatabase('Select database to view:');
      if (!selectedId) {
        return synapse.fail({ reason: 'cancelled', message: 'Database selection cancelled.' });
      }
      databaseId = selectedId;
    }

    const result = await synapse.mcp.callTool('notion', 'notion-fetch', { id: databaseId }, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to retrieve Notion database.',
      });
    }

    const title = extractItemTitle(result.data) || 'Notion Database';
    const url = result.data?.url || `https://notion.so/${databaseId}`;

    return synapse.success({
      id: databaseId,
      title,
      url,
      data: result.data,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Lists all databases in the workspace with optional search filtering.
 *
 * @param {SynapseContext} ctx
 */
async function listDatabases(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    const query = normalizeString(entities.query) || normalizeString(ctx.input?.text) || '';

    const result = await synapse.mcp.callTool(
      'notion',
      'notion-search',
      {
        query,
        filter: { value: 'database', property: 'object' },
      },
      { timeoutMs: 15000 }
    );

    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to list Notion databases.',
      });
    }

    const items = extractResultsArray(result.data);
    const databases = items.map((item) => ({
      id: item.id,
      title: extractItemTitle(item),
      url: item.url || `https://notion.so/${item.id}`,
    }));

    return synapse.success({
      count: databases.length,
      databases,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Handlers: Page Operations
// =============================================================================

/**
 * Quick capture: rapidly saves an idea, link, or OCR snippet into a Notion page.
 *
 * @param {SynapseContext} ctx
 */
async function quickCapture(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    const rawContent = normalizeString(entities.content) || normalizeString(entities.text) || normalizeString(ctx.input?.text) || '';
    const title = normalizeString(entities.title) || inferTitle(rawContent) || `Quick Capture - ${formatDateOnly(new Date())}`;
    const explicitParent = normalizeString(entities.parentPageId) || normalizeString(await synapse.config.get('notion_quick_capture_page_id'));

    let parent = null;
    if (explicitParent) {
      parent = { page_id: explicitParent };
    } else {
      parent = await readConfiguredParent();
    }

    const toolArgs = {
      pages: [
        {
          properties: { title },
          ...(rawContent ? { content: rawContent } : {}),
        },
      ],
      ...(parent ? { parent } : {}),
    };

    const result = await synapse.mcp.callTool('notion', 'notion-create-pages', toolArgs, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to quick-capture note in Notion.',
      });
    }

    const created = extractCreatedPageResult(result.data);
    return synapse.success({
      id: created.id,
      title,
      parent: parent ? (parent.database_id ? `database:${parent.database_id}` : `page:${parent.page_id}`) : 'workspace',
      url: created.url,
      message: `Captured "${title}" into Notion.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Creates a structured Notion page with a title and Markdown content.
 * Prompts user for parent page if not specified.
 *
 * @param {SynapseContext} ctx
 */
async function createPage(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let title = normalizeString(entities.title) || inferTitle(entities.text) || inferTitle(ctx.input?.text);

    if (!title) {
      const promptRes = await synapse.prompt({
        message: 'Enter a title for the new page:',
        fields: [{ name: 'title', type: 'text', label: 'Page Title', required: true }],
      });
      if (promptRes.cancelled || !promptRes.values?.title) {
        return synapse.fail({ reason: 'cancelled', message: 'Page creation cancelled.' });
      }
      title = promptRes.values.title.trim();
    }

    const content = normalizeString(entities.content) || normalizeString(entities.text) || normalizeString(ctx.input?.text) || '';
    let parentPageId = normalizeString(entities.parentPageId) || normalizeString(await synapse.config.get('notion_parent_id'));

    if (!parentPageId) {
      const selectedParent = await promptForPage('Select parent page for new page:');
      if (!selectedParent) {
        return synapse.fail({ reason: 'cancelled', message: 'Parent page selection cancelled.' });
      }
      parentPageId = selectedParent;
    }

    const toolArgs = {
      pages: [
        {
          properties: { title },
          ...(content ? { content } : {}),
        },
      ],
      parent: { page_id: parentPageId },
    };

    const result = await synapse.mcp.callTool('notion', 'notion-create-pages', toolArgs, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to create Notion page.',
      });
    }

    const created = extractCreatedPageResult(result.data);
    return synapse.success({
      id: created.id,
      title,
      url: created.url,
      message: `Created Notion page "${title}".`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Fetches and displays the contents and properties of a Notion page.
 *
 * @param {SynapseContext} ctx
 */
async function viewPage(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let pageId = normalizeString(entities.pageId);

    if (!pageId) {
      const selected = await promptForPage('Select a page to view:');
      if (!selected) {
        return synapse.fail({ reason: 'cancelled', message: 'Page selection cancelled.' });
      }
      pageId = selected;
    }

    const result = await synapse.mcp.callTool('notion', 'notion-fetch', { id: pageId }, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to retrieve Notion page.',
      });
    }

    const title = extractItemTitle(result.data) || 'Notion Page';
    const url = result.data?.url || `https://notion.so/${pageId}`;

    return synapse.success({
      id: pageId,
      title,
      url,
      content: result.data?.content || result.data?.properties || result.data,
      properties: result.data?.properties || {},
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Appends or prepends text, along with an optional date header, to an existing Notion page.
 *
 * @param {SynapseContext} ctx
 */
async function addTextToPage(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let text = normalizeString(entities.text) || normalizeString(entities.content) || normalizeString(ctx.input?.text);

    if (!text) {
      const textPrompt = await synapse.prompt({
        message: 'Enter the text to append to the page:',
        fields: [{ name: 'text', type: 'text', label: 'Content', required: true }],
      });
      if (textPrompt.cancelled || !textPrompt.values?.text) {
        return synapse.fail({ reason: 'cancelled', message: 'Text input cancelled.' });
      }
      text = textPrompt.values.text.trim();
    }

    let pageId = normalizeString(entities.pageId);
    if (!pageId) {
      const selected = await promptForPage('Select page to add text to:');
      if (!selected) {
        return synapse.fail({ reason: 'cancelled', message: 'Page selection cancelled.' });
      }
      pageId = selected;
    }

    const position = entities.position === 'prepend' ? 'prepend' : 'append';
    const includeDate = entities.includeDate !== false;
    const now = new Date();
    const dateHeader = includeDate ? `\n\n---\n**${formatDateTime(now)}**\n` : '\n\n';
    const formattedContent = position === 'prepend' ? `${dateHeader}${text}\n\n` : `${dateHeader}${text}`;

    const toolArgs = {
      page_id: pageId,
      content: formattedContent,
    };

    const result = await synapse.mcp.callTool('notion', 'notion-update-page', toolArgs, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to update Notion page.',
      });
    }

    const pageUrl = result.data?.url || `https://notion.so/${pageId}`;
    return synapse.success({
      pageId,
      position,
      url: pageUrl,
      message: `Added text to Notion page (${position}).`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Writes a quick note into a daily page inside the user's notes notebook.
 *
 * @param {SynapseContext} ctx
 */
async function addNote(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    let note = normalizeString(entities.note) || normalizeString(entities.content) || normalizeString(ctx.input?.text);

    if (!note) {
      const notePrompt = await synapse.prompt({
        message: 'Enter note content for today:',
        fields: [{ name: 'note', type: 'text', label: 'Note', required: true }],
      });
      if (notePrompt.cancelled || !notePrompt.values?.note) {
        return synapse.fail({ reason: 'cancelled', message: 'Note creation cancelled.' });
      }
      note = notePrompt.values.note.trim();
    }

    const now = new Date();
    const dateStr = normalizeString(entities.date) || formatDateOnly(now);
    const title = normalizeString(entities.title) || `Daily Note - ${dateStr}`;
    let notesPageId = normalizeString(entities.notesPageId) || normalizeString(await synapse.config.get('notion_daily_notes_page_id'));

    if (!notesPageId) {
      notesPageId = normalizeString(await synapse.config.get('notion_parent_id'));
    }

    if (!notesPageId) {
      const selected = await promptForPage('Select notes parent page for daily entries:');
      if (!selected) {
        return synapse.fail({ reason: 'cancelled', message: 'Daily notes page selection cancelled.' });
      }
      notesPageId = selected;
    }

    const timeString = formatTimeOnly(now);
    const entryContent = `### ${timeString}\n${note}`;

    const toolArgs = {
      pages: [
        {
          properties: { title },
          content: entryContent,
        },
      ],
      parent: { page_id: notesPageId },
    };

    const result = await synapse.mcp.callTool('notion', 'notion-create-pages', toolArgs, { timeoutMs: 20000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Failed to create daily note in Notion.',
      });
    }

    const created = extractCreatedPageResult(result.data);
    return synapse.success({
      id: created.id,
      title,
      date: dateStr,
      url: created.url,
      message: `Added note to "${title}".`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Handlers: Search
// =============================================================================

/**
 * Searches Notion workspace for pages and databases.
 *
 * @param {SynapseContext} ctx
 */
async function searchNotion(ctx) {
  try {
    await ensureNotionConnection();

    const entities = extractEntities(ctx);
    const query = normalizeString(entities.query) || normalizeString(ctx.input?.text) || '';
    const filterType = normalizeString(entities.filter);

    const toolArgs = {
      query,
      ...(filterType ? { filter: { value: filterType, property: 'object' } } : {}),
    };

    const result = await synapse.mcp.callTool('notion', 'notion-search', toolArgs, { timeoutMs: 15000 });
    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Notion search failed.',
      });
    }

    const rawItems = extractResultsArray(result.data);
    const formattedResults = rawItems.map((item) => ({
      id: item.id,
      title: extractItemTitle(item),
      type: item.object || (filterType || 'page'),
      url: item.url || `https://notion.so/${item.id}`,
    }));

    return synapse.success({
      query,
      filter: filterType || 'all',
      count: formattedResults.length,
      results: formattedResults,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Ensures the host has an active connection grant for the Notion provider.
 */
async function ensureNotionConnection() {
  if (await synapse.connections.isConnected('notion')) return;
  await synapse.connections.connect('notion');
  if (!(await synapse.connections.isConnected('notion'))) {
    throw new Error('Notion connection was not completed.');
  }
}

/**
 * Uses synapse.prompt() to allow the user to select from available workspace pages.
 *
 * @param {string} promptMessage
 * @returns {Promise<string | null>}
 */
async function promptForPage(promptMessage) {
  const searchRes = await synapse.mcp.callTool(
    'notion',
    'notion-search',
    { query: '', filter: { value: 'page', property: 'object' } },
    { timeoutMs: 10000 }
  );

  const pages = extractResultsArray(searchRes?.data);
  if (pages.length > 0) {
    const options = pages.slice(0, 8).map((p) => ({
      value: p.id,
      label: extractItemTitle(p),
    }));

    const response = await synapse.prompt({
      message: promptMessage,
      fields: [
        {
          name: 'pageId',
          type: 'select',
          label: 'Notion Page',
          options,
          required: true,
        },
      ],
    });

    if (!response.cancelled && response.values?.pageId) {
      return response.values.pageId;
    }
  }

  // Fallback: ask for page ID or title directly
  const textPrompt = await synapse.prompt({
    message: promptMessage,
    fields: [
      {
        name: 'pageId',
        type: 'text',
        label: 'Page ID or URL',
        required: true,
      },
    ],
  });

  return !textPrompt.cancelled && textPrompt.values?.pageId ? textPrompt.values.pageId.trim() : null;
}

/**
 * Uses synapse.prompt() to allow the user to select from available workspace databases.
 *
 * @param {string} promptMessage
 * @returns {Promise<string | null>}
 */
async function promptForDatabase(promptMessage) {
  const searchRes = await synapse.mcp.callTool(
    'notion',
    'notion-search',
    { query: '', filter: { value: 'database', property: 'object' } },
    { timeoutMs: 10000 }
  );

  const dbs = extractResultsArray(searchRes?.data);
  if (dbs.length > 0) {
    const options = dbs.slice(0, 8).map((d) => ({
      value: d.id,
      label: extractItemTitle(d),
    }));

    const response = await synapse.prompt({
      message: promptMessage,
      fields: [
        {
          name: 'databaseId',
          type: 'select',
          label: 'Notion Database',
          options,
          required: true,
        },
      ],
    });

    if (!response.cancelled && response.values?.databaseId) {
      return response.values.databaseId;
    }
  }

  // Fallback: ask for database ID directly
  const textPrompt = await synapse.prompt({
    message: promptMessage,
    fields: [
      {
        name: 'databaseId',
        type: 'text',
        label: 'Database ID or URL',
        required: true,
      },
    ],
  });

  return !textPrompt.cancelled && textPrompt.values?.databaseId ? textPrompt.values.databaseId.trim() : null;
}

/**
 * Extracts entities safely from context regardless of LLM wrapping.
 *
 * @param {SynapseContext} ctx
 * @returns {Record<string, any>}
 */
function extractEntities(ctx) {
  const llmEntities = ctx.llm?.entities;
  if (llmEntities && typeof llmEntities === 'object') {
    if (llmEntities.entities && typeof llmEntities.entities === 'object') {
      return llmEntities.entities;
    }
    if (llmEntities.llm?.entities && typeof llmEntities.llm.entities === 'object') {
      return llmEntities.llm.entities;
    }
    return llmEntities;
  }
  if (ctx.input && typeof ctx.input === 'object' && ctx.input.input) {
    return ctx.input.input;
  }
  return ctx.input || {};
}

/**
 * Extracts a created page ID and URL from MCP tool responses.
 *
 * @param {any} data
 * @returns {{ id: string, url: string }}
 */
function extractCreatedPageResult(data) {
  if (!data) return { id: 'created', url: 'https://notion.so' };
  if (Array.isArray(data) && data.length > 0) {
    return {
      id: data[0].id || 'created',
      url: data[0].url || (data[0].id ? `https://notion.so/${data[0].id}` : 'https://notion.so'),
    };
  }
  if (Array.isArray(data.pages) && data.pages.length > 0) {
    return {
      id: data.pages[0].id || 'created',
      url: data.pages[0].url || (data.pages[0].id ? `https://notion.so/${data.pages[0].id}` : 'https://notion.so'),
    };
  }
  return {
    id: data.id || 'created',
    url: data.url || (data.id ? `https://notion.so/${data.id}` : 'https://notion.so'),
  };
}

/**
 * Extracts an array of items from Notion search results.
 *
 * @param {any} data
 * @returns {any[]}
 */
function extractResultsArray(data) {
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Extracts a human-readable title from Notion page or database objects.
 *
 * @param {any} item
 * @returns {string}
 */
function extractItemTitle(item) {
  if (!item) return 'Untitled';
  if (typeof item.title === 'string' && item.title.trim()) return item.title.trim();
  if (Array.isArray(item.title) && item.title.length > 0) {
    const text = item.title.map((t) => t.plain_text || t.text?.content || '').join('').trim();
    if (text) return text;
  }
  if (item.properties?.Name?.title && Array.isArray(item.properties.Name.title)) {
    const text = item.properties.Name.title.map((t) => t.plain_text || '').join('').trim();
    if (text) return text;
  }
  if (item.properties?.title?.title && Array.isArray(item.properties.title.title)) {
    const text = item.properties.title.title.map((t) => t.plain_text || '').join('').trim();
    if (text) return text;
  }
  return item.name || item.id || 'Untitled';
}

/**
 * Reads configured workspace parent.
 */
async function readConfiguredParent() {
  const id = normalizeString(await synapse.config.get('notion_parent_id'));
  if (!id) return null;

  const type = normalizeString(await synapse.config.get('notion_parent_type')) || 'auto';
  if (type === 'database') return { database_id: id };
  if (type === 'data_source' || id.startsWith('collection://')) {
    return { data_source_id: id };
  }
  return { page_id: id };
}

/**
 * Normalizes input string.
 *
 * @param {any} value
 * @returns {string | null}
 */
function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Infers a clean title from the first line of content.
 *
 * @param {string | null} text
 * @returns {string | null}
 */
function inferTitle(text) {
  if (!text) return null;
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean);
  if (!firstLine) return null;
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77)}...`;
}

/**
 * Formats a Date object to YYYY-MM-DD.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a Date object to HH:MM.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatTimeOnly(date) {
  return date.toTimeString().slice(0, 5);
}

/**
 * Formats a Date object to YYYY-MM-DD HH:MM.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  return `${formatDateOnly(date)} ${formatTimeOnly(date)}`;
}

/**
 * Standardizes execution error return.
 *
 * @param {unknown} error
 * @returns {SynapseResult}
 */
function handleExecutionError(error) {
  return synapse.fail({
    reason: 'execution_error',
    message: error instanceof Error ? error.message : String(error),
  });
}
