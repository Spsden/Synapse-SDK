// @ts-check
/// <reference path="./synapse-global.d.ts" />

/**
 * Add to Notion (MCP)
 *
 * Design goals:
 * - Use only MCP for Notion actions.
 * - Keep tool name configurable (MCP server ecosystems vary).
 * - Keep payload conservative and explicit for initial E2E tests.
 */

synapse.register('add_to_notion_mcp', async (ctx) => {
  synapse.log('Notion MCP: add_to_notion_mcp triggered');

  try {
    await ensureNotionAuth();

    const toolName =
      (await synapse.config.get('notion_create_tool')) ||
      'notion-create-pages';
    const pingTool =
      (await synapse.config.get('notion_ping_tool')) ||
      'notion-get-self';

    if (pingTool !== 'none') {
      const ping = await synapse.mcp.callTool('notion', pingTool, {});
      if (!ping.success) {
        return synapse.fail({
          reason: 'mcp_connectivity',
          message: `Notion MCP connectivity check failed: ${ping.error || ping.code || 'unknown error'}`
        });
      }
    }

    const title =
      normalizeString(ctx.llm?.entities?.title) ||
      normalizeString(ctx.input?.title) ||
      inferTitleFromText(normalizeString(ctx.input?.text)) ||
      'Note from Synapse';

    const content =
      normalizeString(ctx.llm?.entities?.content) ||
      normalizeString(ctx.input?.content) ||
      normalizeString(ctx.input?.text) ||
      '';

    const parent = await readParentConfig();
    const payload = buildCreatePayload({ title, content, parent });

    synapse.log(`Notion MCP: calling ${toolName}`);
    const result = await synapse.mcp.callTool('notion', toolName, payload, {
      timeoutMs: 15000,
      routingPolicy: 'prefer-local'
    });

    if (!result.success) {
      return synapse.fail({
        reason: 'mcp_error',
        message: `Notion MCP failed: ${result.error || result.code || 'unknown error'}`
      });
    }

    const summary = summarizeResult(result.data);
    return synapse.success({
      message: 'Added to Notion via MCP',
      data: {
        tool: toolName,
        title,
        summary,
        raw: result.data
      }
    });
  } catch (e) {
    return synapse.fail({
      reason: 'execution_error',
      message: e && e.message ? e.message : String(e)
    });
  }
});

async function ensureNotionAuth() {
  const isAuth = await synapse.auth.isAuthenticated('notion');
  if (isAuth) return;

  await synapse.auth.authenticate('notion');

  const after = await synapse.auth.isAuthenticated('notion');
  if (!after) {
    throw new Error('Notion authentication was not completed');
  }
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inferTitleFromText(text) {
  if (!text) return null;
  const line = text.split('\n').map((s) => s.trim()).find(Boolean);
  if (!line) return null;
  return line.length <= 80 ? line : `${line.slice(0, 77)}...`;
}

async function readParentConfig() {
  const rawId = normalizeString(await synapse.config.get('notion_parent_id'));
  const rawType = normalizeString(await synapse.config.get('notion_parent_type')) || 'auto';

  if (!rawId) return null;

  if (rawType === 'page') {
    return { page_id: rawId };
  }
  if (rawType === 'database') {
    return { database_id: rawId };
  }
  if (rawType === 'data_source') {
    return { data_source_id: rawId };
  }

  // auto detection fallback by prefix convention
  if (rawId.startsWith('collection://')) {
    return { data_source_id: rawId };
  }

  // default to page_id for safety in auto mode
  return { page_id: rawId };
}

function buildCreatePayload({ title, content, parent }) {
  // Many Notion MCP implementations support an array-based pages payload.
  // Keep markdown-like content and explicit title for broad compatibility.
  const page = {
    title,
    ...(content
      ? {
          // Servers may map one of these fields depending on implementation.
          content,
          markdown: content
        }
      : {}),
    ...(parent ? { parent } : {})
  };

  return { pages: [page] };
}

function summarizeResult(data) {
  if (!data || typeof data !== 'object') {
    return String(data || 'ok');
  }

  const url = data.url || (data.page && data.page.url);
  const id = data.id || (data.page && data.page.id);
  const created = data.created || data.page || data.pages;

  return {
    url: url || null,
    id: id || null,
    created: created ? true : false
  };
}
