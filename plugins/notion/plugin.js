// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

for (const trigger of ['add_to_notion', 'save_to_notion']) {
  synapse.register(trigger, addToNotion);
}

for (const trigger of ['search_notion', 'list_notion_databases']) {
  synapse.register(trigger, searchNotion);
}

async function addToNotion(ctx) {
  try {
    await ensureNotionConnection();

    const entities =
      (ctx.llm?.entities && typeof ctx.llm.entities === 'object' && ctx.llm.entities.entities) ||
      (ctx.llm?.entities && typeof ctx.llm.entities === 'object' && ctx.llm.entities.llm?.entities) ||
      ctx.llm?.entities ||
      {};
    const inputObj =
      (ctx.input && typeof ctx.input === 'object' && ctx.input.input) ||
      ctx.input ||
      {};

    const title =
      normalizeString(entities.title) ||
      normalizeString(inputObj.title) ||
      normalizeString(ctx.input?.title) ||
      inferTitle(normalizeString(inputObj.text)) ||
      inferTitle(normalizeString(ctx.input?.text)) ||
      'Note from Synapse';
    const content =
      normalizeString(entities.content) ||
      normalizeString(inputObj.content) ||
      normalizeString(ctx.input?.content) ||
      normalizeString(inputObj.text) ||
      normalizeString(ctx.input?.text) ||
      '';

    // Check for explicitly provided parent database or page
    const explicitDatabaseId =
      normalizeString(entities.databaseId) ||
      normalizeString(inputObj.databaseId) ||
      normalizeString(ctx.input?.databaseId);
    const explicitParentPageId =
      normalizeString(entities.parentPageId) ||
      normalizeString(inputObj.parentPageId) ||
      normalizeString(ctx.input?.parentPageId);

    let parent = null;
    if (explicitDatabaseId) {
      parent = { database_id: explicitDatabaseId };
    } else if (explicitParentPageId) {
      parent = { page_id: explicitParentPageId };
    } else {
      parent = await readParent();
    }

    const result = await synapse.mcp.callTool(
      'notion',
      'notion-create-pages',
      {
        pages: [
          {
            properties: {
              title,
            },
            ...(content ? { content } : {}),
          },
        ],
        ...(parent ? { parent } : {}),
      },
      { timeoutMs: 20000 },
    );

    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Notion could not create the page.',
      });
    }

    return synapse.success({
      tool: 'notion-create-pages',
      title,
      parent: parent
        ? (parent.database_id ? `database:${parent.database_id}` : `page:${parent.page_id}`)
        : 'default',
      result: result.data,
    });
  } catch (error) {
    return synapse.fail({
      reason: 'execution_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function searchNotion(ctx) {
  try {
    await ensureNotionConnection();

    const entities =
      (ctx.llm?.entities && typeof ctx.llm.entities === 'object' && ctx.llm.entities.entities) ||
      (ctx.llm?.entities && typeof ctx.llm.entities === 'object' && ctx.llm.entities.llm?.entities) ||
      ctx.llm?.entities ||
      {};
    const inputObj =
      (ctx.input && typeof ctx.input === 'object' && ctx.input.input) ||
      ctx.input ||
      {};

    const query =
      normalizeString(entities.query) ||
      normalizeString(inputObj.query) ||
      normalizeString(ctx.input?.query) ||
      normalizeString(inputObj.text) ||
      normalizeString(ctx.input?.text) ||
      '';

    const filterType =
      normalizeString(entities.filter) ||
      normalizeString(inputObj.filter) ||
      normalizeString(ctx.input?.filter) ||
      'database';

    const toolArgs = {
      query,
      ...(filterType ? { filter: { value: filterType, property: 'object' } } : {}),
    };

    const result = await synapse.mcp.callTool(
      'notion',
      'notion-search',
      toolArgs,
      { timeoutMs: 15000 },
    );

    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: result.error || 'Notion search failed.',
      });
    }

    const rawItems = Array.isArray(result.data?.results)
      ? result.data.results
      : Array.isArray(result.data)
      ? result.data
      : [];

    const formattedResults = rawItems.map((item) => ({
      id: item.id,
      title: extractItemTitle(item),
      type: item.object || filterType,
      url: item.url || null,
    }));

    return synapse.success({
      query,
      filter: filterType,
      count: formattedResults.length,
      results: formattedResults,
    });
  } catch (error) {
    return synapse.fail({
      reason: 'execution_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function extractItemTitle(item) {
  if (typeof item.title === 'string') return item.title;
  if (Array.isArray(item.title)) {
    const text = item.title
      .map((t) => t.plain_text || t.text?.content || '')
      .join('');
    if (text) return text;
  }
  if (item.properties?.Name?.title && Array.isArray(item.properties.Name.title)) {
    const text = item.properties.Name.title
      .map((t) => t.plain_text || '')
      .join('');
    if (text) return text;
  }
  if (item.properties?.title?.title && Array.isArray(item.properties.title.title)) {
    const text = item.properties.title.title
      .map((t) => t.plain_text || '')
      .join('');
    if (text) return text;
  }
  return item.name || item.id || 'Untitled';
}

async function ensureNotionConnection() {
  if (await synapse.connections.isConnected('notion')) return;
  await synapse.connections.connect('notion');
  if (!(await synapse.connections.isConnected('notion'))) {
    throw new Error('Notion connection was not completed.');
  }
}

async function readParent() {
  const id = normalizeString(await synapse.config.get('notion_parent_id'));
  if (!id) return null;

  const type =
    normalizeString(await synapse.config.get('notion_parent_type')) || 'auto';
  if (type === 'database') return { database_id: id };
  if (type === 'data_source' || id.startsWith('collection://')) {
    return { data_source_id: id };
  }
  return { page_id: id };
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inferTitle(text) {
  if (!text) return null;
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  return firstLine.length <= 80
    ? firstLine
    : `${firstLine.slice(0, 77)}...`;
}
