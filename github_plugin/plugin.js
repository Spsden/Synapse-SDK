// @ts-check
/// <reference path="../types/synapse-global.d.ts" />

// Create GitHub Issue - Synapse Plugin

const GITHUB_API = 'https://api.github.com';
const GITHUB_HEADERS = { Accept: 'application/vnd.github+json' };

async function createIssue(ctx) {
  synapse.log('GitHub: create_issue triggered');

  try {
    // 1. Authenticate
    if (!await synapse.auth.isAuthenticated('github')) {
      synapse.log('GitHub: requesting login');
      try {
        await synapse.auth.authenticate('github');
      } catch (e) {
        return synapse.fail({
          reason: 'auth_failed',
          message: 'GitHub login was declined or failed.'
        });
      }
    }

    // 2. Resolve the repository (repo URL, owner/name entity, or search)
    const repo = await resolveRepo(ctx);
    if (!repo) {
      return synapse.fail({
        reason: 'cancelled',
        message: 'No repository selected.'
      });
    }

    // 3. Title (ask if the LLM didn't extract one)
    const entities = ctx.llm.entities;
    let title = typeof entities.title === 'string' ? entities.title.trim() : '';
    if (!title) {
      title = await askText(ctx, `Title for the issue in ${repo.full_name}?`, 'Issue title');
    }
    if (!title) {
      return synapse.fail({
        reason: 'validation',
        message: 'An issue title is required.'
      });
    }

    // 4. Body
    const body = (typeof entities.body === 'string' && entities.body)
      || (typeof entities.description === 'string' && entities.description)
      || ctx.input.text
      || '';

    // 5. Labels
    const labels = Array.isArray(entities.labels)
      ? entities.labels.filter(l => typeof l === 'string')
      : [];

    // 6. Create
    synapse.log(`GitHub: creating issue in ${repo.full_name}`);
    const res = await synapse.fetch(`${GITHUB_API}/repos/${repo.full_name}/issues`, {
      method: 'POST',
      headers: { ...GITHUB_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels }),
      provider: 'github'
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: errorData.message || `GitHub API error: ${res.statusText}`
      });
    }

    const issue = await res.json();
    return synapse.success({
      message: `Created #${issue.number} in ${repo.full_name}: ${title}`,
      number: issue.number,
      repo: repo.full_name,
      link: issue.html_url
    });

  } catch (e) {
    synapse.log(`GitHub Error: ${e.message}`);
    return synapse.fail({
      reason: 'error',
      message: e.message || 'An unexpected error occurred.'
    });
  }
}

synapse.register('create_issue', createIssue);
synapse.register('create_github_issue', createIssue);
synapse.register('file_github_issue', createIssue);

// =============================================================================
// Repository resolution
// =============================================================================

async function resolveRepo(ctx) {
  const entities = ctx.llm.entities;

  // Shared repo link: https://github.com/<owner>/<repo>/...
  const url = ctx.input.url || (typeof entities.url === 'string' ? entities.url : '');
  const urlMatch = url.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  let candidate = urlMatch ? urlMatch[1].replace(/\.git$/, '') : '';

  const repoEntity = typeof entities.repo === 'string' ? entities.repo.trim() : '';
  if (!candidate && repoEntity) {
    candidate = repoEntity;
  }

  // A full owner/name — validate it directly.
  if (candidate && candidate.includes('/')) {
    const direct = await fetchRepo(candidate);
    if (direct) {
      return direct;
    }
    // Not accessible — fall through to the user's repository list.
  }

  const repos = await fetchRepos();
  if (!repos.length) {
    return null;
  }

  // Try to match the bare name (or failed owner/name) against the list.
  const needle = candidate ? candidate.toLowerCase() : '';
  const wanted = repoEntity ? repoEntity.toLowerCase() : needle;
  if (wanted) {
    const matches = repos.filter(r => r.full_name.toLowerCase().includes(wanted));
    if (matches.length === 1) {
      return matches[0];
    }
  }

  if (repos.length === 1) {
    return repos[0];
  }

  const chosen = await chooseOption(
    ctx,
    'Which repository should the issue go in?',
    repos.slice(0, 30).map(r => ({ value: r.full_name, label: r.full_name }))
  );
  return chosen ? repos.find(r => r.full_name === chosen) : null;
}

async function fetchRepo(fullName) {
  const res = await synapse.fetch(`${GITHUB_API}/repos/${fullName}`, {
    headers: GITHUB_HEADERS,
    provider: 'github'
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return { full_name: data.full_name };
}

async function fetchRepos() {
  const res = await synapse.fetch(
    `${GITHUB_API}/user/repos?sort=pushed&per_page=100`,
    { headers: GITHUB_HEADERS, provider: 'github' }
  );
  if (!res.ok) {
    throw new Error(`Failed to list repositories: ${res.statusText}`);
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : [])
    .filter(r => r && r.full_name)
    .map(r => ({ full_name: r.full_name }));
}

// =============================================================================
// Dual-mode user interaction
// =============================================================================

function canPrompt(ctx) {
  return Boolean(
    ctx.execution &&
    ctx.execution.surface === 'chat' &&
    ctx.execution.capabilities?.prompt
  );
}

/**
 * Ask the user to pick one option. In a chat run the question is asked
 * inside the conversation via synapse.prompt(); in a share run (or on
 * hosts without prompt support) an HTML picker is shown instead.
 * Returns the chosen value, or null if the user cancelled.
 */
async function chooseOption(ctx, message, options) {
  if (canPrompt(ctx)) {
    const result = await synapse.prompt({
      message,
      fields: [{
        name: 'choice',
        type: 'select',
        label: 'Choose',
        required: true,
        options
      }]
    });
    if (result.cancelled || !result.values || !result.values.choice) {
      return null;
    }
    return result.values.choice;
  }

  return showOptionPicker(message, options);
}

/**
 * Ask the user for a single line of text. Chat runs use synapse.prompt();
 * share runs get an HTML form. Returns the trimmed answer, or null if
 * cancelled.
 */
async function askText(ctx, message, placeholder) {
  if (canPrompt(ctx)) {
    const result = await synapse.prompt({
      message,
      fields: [{
        name: 'answer',
        type: 'text',
        label: 'Answer',
        placeholder,
        required: true
      }]
    });
    if (result.cancelled || !result.values || !result.values.answer) {
      return null;
    }
    return result.values.answer.trim();
  }

  return showTextForm(message, placeholder);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function showOptionPicker(title, options) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 24px;
          margin: 0;
          background-color: #0d1117;
          color: #c9d1d9;
        }
        h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
        }
        .list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .item {
          padding: 12px 16px;
          border: 1px solid #30363d;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
        }
        .item:hover {
          background-color: #238636;
          border-color: #238636;
          color: #ffffff;
        }
      </style>
    </head>
    <body>
      <h2>${escapeHtml(title)}</h2>
      <div class="list">
        ${options.map(option => `
          <div class="item" data-value="${escapeHtml(option.value)}" onclick="select(this.dataset.value)">
            <span>${escapeHtml(option.label)}</span>
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
    title,
    width: 420,
    height: 520
  });

  return (result && result.action === 'selected') ? result.id : null;
}

async function showTextForm(message, placeholder) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          padding: 24px;
          margin: 0;
          background-color: #0d1117;
          color: #c9d1d9;
        }
        p { font-size: 15px; margin-bottom: 16px; }
        input {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border: 1px solid #30363d;
          border-radius: 8px;
          background-color: #161b22;
          color: #c9d1d9;
          font-size: 14px;
        }
        input:focus { outline: none; border-color: #58a6ff; }
        button {
          margin-top: 16px;
          width: 100%;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          background-color: #238636;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        button:hover { background-color: #2ea043; }
      </style>
    </head>
    <body>
      <p>${escapeHtml(message)}</p>
      <input id="answer" type="text" placeholder="${escapeHtml(placeholder || '')}" />
      <button onclick="submit()">Submit</button>
      <script>
        function submit() {
          var value = document.getElementById('answer').value.trim();
          if (!value) return;
          SynapseBridge.postMessage({ action: 'submit', value: value });
        }
      </script>
    </body>
    </html>
  `;

  const result = await synapse.ui.show(html, {
    title: 'GitHub',
    width: 380,
    height: 260
  });

  return (result && result.action === 'submit' && result.value) ? result.value : null;
}
