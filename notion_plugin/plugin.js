// Notion Capture - Synapse Plugin

synapse.register('add_to_notion', async (ctx) => {
  synapse.log('Notion Capture: add_to_notion triggered');

  try {
    // 1. Authenticate
    if (!await synapse.auth.isAuthenticated('notion')) {
      synapse.log('Notion: Triggering authentication');
      await synapse.auth.authenticate('notion');
    }

    // 2. Fetch Databases
    synapse.log('Notion: Fetching databases');
    const databases = await fetchDatabases();

    if (!databases || databases.length === 0) {
      return synapse.fail({
        reason: 'no_databases',
        message: 'No accessible databases found. Make sure you have shared your database with the integration.'
      });
    }

    // 3. Select Database
    let databaseId;
    if (databases.length === 1) {
      databaseId = databases[0].id;
    } else {
      synapse.log('Notion: Showing database selector');
      databaseId = await showDatabaseSelector(databases);
    }

    if (!databaseId) {
      return synapse.fail({
        reason: 'cancelled',
        message: 'No database selected.'
      });
    }

    // 4. Create Page
    const title = ctx.llm.entities.title || ctx.input.title || 'Note from Synapse';
    const content = ctx.llm.entities.content || ctx.input.content || '';

    synapse.log(`Notion: Creating page in database ${databaseId}`);
    return await createNotionPage(databaseId, title, content);

  } catch (e) {
    synapse.log(`Notion Error: ${e.message}`);
    return synapse.fail({
      reason: 'error',
      message: e.message || 'An unexpected error occurred.'
    });
  }
});

async function fetchDatabases() {
  const res = await synapse.fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    provider: 'notion',
    body: JSON.stringify({
      filter: {
        property: 'object',
        value: 'database'
      }
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch databases: ${res.statusText}`);
  }

  const data = await res.json();
  return data.results.map(db => ({
    id: db.id,
    name: db.title?.[0]?.plain_text || 'Untitled Database'
  }));
}

async function showDatabaseSelector(databases) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 24px;
          margin: 0;
          background-color: #fff;
          color: #37352f;
        }
        h2 { 
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          color: #37352f;
        }
        .db-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .db-item { 
          padding: 12px 16px;
          border: 1px solid #e9e9e8;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          font-size: 14px;
        }
        .db-item:hover { 
          background-color: #f7f7f5;
          border-color: #dfdfde;
        }
        .db-icon {
          margin-right: 12px;
          font-size: 18px;
        }
      </style>
    </head>
    <body>
      <h2>Select Notion Database</h2>
      <div class="db-list">
        ${databases.map(db => `
          <div class="db-item" onclick="select('${db.id}')">
            <span class="db-icon">📄</span>
            <span>${db.name}</span>
          </div>
        `).join('')}
      </div>
      <script>
        function select(id) {
          SynapseBridge.postMessage({ 
            action: 'selected', 
            id: id 
          });
        }
      </script>
    </body>
    </html>
  `;

  const result = await synapse.ui.show(html, {
    title: 'Notion Database',
    width: 400,
    height: 500
  });

  return (result && result.action === 'selected') ? result.id : null;
}

async function createNotionPage(databaseId, title, content) {
  const body = {
    parent: { database_id: databaseId },
    properties: {
      "Name": {
        title: [
          { text: { content: title } }
        ]
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { text: { content: content } }
          ]
        }
      }
    ]
  };

  const res = await synapse.fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    provider: 'notion',
    body: JSON.stringify(body)
  });

  if (res.ok) {
    const data = await res.json();
    return synapse.success({
      message: 'Note successfully added to Notion!',
      data: {
        url: data.url,
        id: data.id
      }
    });
  } else {
    const err = await res.json().catch(() => ({}));
    return synapse.fail({
      reason: 'api_error',
      message: err.message || 'Failed to create Notion page'
    });
  }
}
