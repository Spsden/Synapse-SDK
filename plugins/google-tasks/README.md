# Google Tasks Plugin for Synapse

Manage your to-do lists, add tasks, review pending items, and check off items using the Google Tasks REST API v1.

## Actions

- **`create_task`**: Add a task with title, notes, due date, and target list.
- **`list_tasks`**: Retrieve uncompleted tasks from your task list.
- **`complete_task`**: Mark a task as completed with interactive task selection.
- **`list_tasklists`**: Inspect all available task lists.

## OAuth Configuration

- **Provider:** `google-tasks`
- **Alias:** `google_tasks`
- **Scopes:**
  - `https://www.googleapis.com/auth/tasks`
  - `https://www.googleapis.com/auth/tasks.readonly`

## Local Testing

Set in `.env`:
```bash
SYNAPSE_CONNECTION_GOOGLE_TASKS=ya29.a0A...
```

Run CLI:
```bash
node cli/dist/index.js run create_task --dir plugins/google-tasks --text "Review Q3 deliverables"
node cli/dist/index.js run list_tasks --dir plugins/google-tasks
```

