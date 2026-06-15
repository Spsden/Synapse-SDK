// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

for (const trigger of ['add_to_notion', 'save_to_notion']) {
  synapse.register(trigger, addToNotion);
}

async function addToNotion(ctx) {
  try {
    await ensureNotionConnection();

    const title =
      normalizeString(ctx.llm?.entities?.title) ||
      normalizeString(ctx.input?.title) ||
      inferTitle(normalizeString(ctx.input?.text)) ||
      'Note from Synapse';
    const content =
      normalizeString(ctx.llm?.entities?.content) ||
      normalizeString(ctx.input?.content) ||
      normalizeString(ctx.input?.text) ||
      '';
    const parent = await readParent();
    const result = await synapse.mcp.callTool(
      'notion',
      'notion-create-pages',
      {
        pages: [
          {
            title,
            ...(content ? { content, markdown: content } : {}),
            ...(parent ? { parent } : {}),
          },
        ],
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
      result: result.data,
    });
  } catch (error) {
    return synapse.fail({
      reason: 'execution_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
