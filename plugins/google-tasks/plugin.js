// @ts-check
/// <reference path="../../types/synapse-global.d.ts" />

/**
 * =============================================================================
 * Google Tasks Plugin for Synapse (Manifest v2)
 * =============================================================================
 * Integrates directly with Google Tasks REST API v1:
 * - create_task: Add to-do items with notes and due dates
 * - list_tasks: Review active tasks in any task list
 * - complete_task: Check off tasks with interactive picker fallback
 * - list_tasklists: Inspect available task lists
 */

const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';

// =============================================================================
// Action Registrations
// =============================================================================

for (const trigger of ['create_task', 'add_task', 'new_google_task', 'add_todo']) {
  synapse.register(trigger, createTask);
}

for (const trigger of ['list_tasks', 'get_tasks', 'show_tasks', 'my_tasks']) {
  synapse.register(trigger, listTasks);
}

for (const trigger of ['complete_task', 'finish_task', 'done_task', 'mark_task_completed']) {
  synapse.register(trigger, completeTask);
}

for (const trigger of ['list_tasklists', 'get_tasklists', 'show_tasklists']) {
  synapse.register(trigger, listTasklists);
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Adds a new task to Google Tasks.
 *
 * @param {SynapseContext} ctx
 */
async function createTask(ctx) {
  try {
    await ensureTasksConnection();

    const entities = extractEntities(ctx);
    let title = normalizeString(entities.title) || inferTitle(entities.text) || inferTitle(ctx.input?.text);

    if (!title) {
      const promptRes = await synapse.prompt({
        message: 'Enter task title or to-do item:',
        fields: [{ name: 'title', type: 'text', label: 'Task Title', required: true }],
      });
      if (promptRes.cancelled || !promptRes.values?.title) {
        return synapse.fail({ reason: 'cancelled', message: 'Task creation cancelled: missing title.' });
      }
      title = promptRes.values.title.trim();
    }

    const notes = normalizeString(entities.notes) || normalizeString(entities.description) || '';
    const due = normalizeString(entities.due) || normalizeString(entities.dueDate);
    const tasklistId = encodeURIComponent(normalizeString(entities.tasklistId) || '@default');

    const taskPayload = {
      title,
      ...(notes ? { notes } : {}),
      ...(due ? { due } : {}),
    };

    const res = await synapse.fetch(`${TASKS_BASE}/lists/${tasklistId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      connection: 'google_tasks',
      body: JSON.stringify(taskPayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Google Tasks API error (${res.status})`,
      });
    }

    const data = await res.json();
    return synapse.success({
      id: data.id,
      title: data.title || title,
      due: data.due || '',
      link: data.selfLink || '',
      message: `Created task "${data.title || title}" in Google Tasks.`,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Lists tasks from a Google Tasks list.
 *
 * @param {SynapseContext} ctx
 */
async function listTasks(ctx) {
  try {
    await ensureTasksConnection();

    const entities = extractEntities(ctx);
    const tasklistId = encodeURIComponent(normalizeString(entities.tasklistId) || '@default');
    const showCompleted = entities.showCompleted === true;
    const maxResults = entities.maxResults ? Number(entities.maxResults) : 20;

    const queryParams = toQueryString({
      showCompleted: String(showCompleted),
      showHidden: String(showCompleted),
      maxResults: String(maxResults),
    });

    const res = await synapse.fetch(`${TASKS_BASE}/lists/${tasklistId}/tasks${queryParams}`, {
      method: 'GET',
      connection: 'google_tasks',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to fetch tasks (${res.status})`,
      });
    }

    const data = await res.json();
    const rawItems = Array.isArray(data.items) ? data.items : [];

    const tasks = rawItems.map((item) => ({
      id: item.id,
      title: item.title || 'Untitled Task',
      status: item.status || 'needsAction',
      due: item.due || '',
    }));

    return synapse.success({
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Marks a task as completed.
 * Prompts user to pick from uncompleted tasks if taskId is not specified.
 *
 * @param {SynapseContext} ctx
 */
async function completeTask(ctx) {
  try {
    await ensureTasksConnection();

    const entities = extractEntities(ctx);
    const tasklistId = encodeURIComponent(normalizeString(entities.tasklistId) || '@default');
    let taskId = normalizeString(entities.taskId);

    // If taskId is missing, fetch active tasks and prompt user
    if (!taskId) {
      const listRes = await synapse.fetch(`${TASKS_BASE}/lists/${tasklistId}/tasks?showCompleted=false&maxResults=10`, {
        method: 'GET',
        connection: 'google_tasks',
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        const items = Array.isArray(listData.items) ? listData.items : [];
        if (items.length > 0) {
          const options = items.map((item) => ({
            value: item.id,
            label: item.title || 'Untitled Task',
          }));

          const promptRes = await synapse.prompt({
            message: 'Select a task to mark as completed:',
            fields: [{ name: 'taskId', type: 'select', label: 'Task', options, required: true }],
          });

          if (!promptRes.cancelled && promptRes.values?.taskId) {
            taskId = promptRes.values.taskId;
          }
        }
      }

      if (!taskId) {
        const textPrompt = await synapse.prompt({
          message: 'Enter the Task ID to complete:',
          fields: [{ name: 'taskId', type: 'text', label: 'Task ID', required: true }],
        });
        if (textPrompt.cancelled || !textPrompt.values?.taskId) {
          return synapse.fail({ reason: 'cancelled', message: 'Complete task cancelled.' });
        }
        taskId = textPrompt.values.taskId.trim();
      }
    }

    const res = await synapse.fetch(`${TASKS_BASE}/lists/${tasklistId}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      connection: 'google_tasks',
      body: JSON.stringify({ status: 'completed' }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to complete task (${res.status})`,
      });
    }

    return synapse.success({
      id: taskId,
      status: 'completed',
      message: 'Task marked as completed in Google Tasks.',
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

/**
 * Lists all task lists in the user's account.
 *
 * @param {SynapseContext} ctx
 */
async function listTasklists(ctx) {
  try {
    await ensureTasksConnection();

    const res = await synapse.fetch(`${TASKS_BASE}/users/@me/lists`, {
      method: 'GET',
      connection: 'google_tasks',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return synapse.fail({
        reason: 'api_error',
        message: err.error?.message || `Failed to list task lists (${res.status})`,
      });
    }

    const data = await res.json();
    const rawLists = Array.isArray(data.items) ? data.items : [];

    const tasklists = rawLists.map((item) => ({
      id: item.id,
      title: item.title || 'Untitled List',
    }));

    return synapse.success({
      count: tasklists.length,
      tasklists,
    });
  } catch (error) {
    return handleExecutionError(error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function ensureTasksConnection() {
  if (await synapse.connections.isConnected('google_tasks')) return;
  await synapse.connections.connect('google_tasks');
  if (!(await synapse.connections.isConnected('google_tasks'))) {
    throw new Error('Google Tasks connection was not completed.');
  }
}

function extractEntities(ctx) {
  const llmEntities = ctx.llm?.entities;
  if (llmEntities && typeof llmEntities === 'object') {
    if (llmEntities.entities && typeof llmEntities.entities === 'object') return llmEntities.entities;
    if (llmEntities.llm?.entities && typeof llmEntities.llm.entities === 'object') return llmEntities.llm.entities;
    return llmEntities;
  }
  if (ctx.input && typeof ctx.input === 'object' && ctx.input.input) return ctx.input.input;
  return ctx.input || {};
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inferTitle(text) {
  if (!text) return null;
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean);
  if (!firstLine) return null;
  return firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77)}...`;
}

function handleExecutionError(error) {
  return synapse.fail({
    reason: 'execution_error',
    message: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Encodes an object into a URL query string without external dependencies.
 * @param {Record<string, string | number | boolean | undefined | null>} params
 * @returns {string}
 */
function toQueryString(params) {
  const parts = [];
  for (const key of Object.keys(params)) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

