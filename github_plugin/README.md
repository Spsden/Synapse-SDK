# Create GitHub Issue

A Synapse plugin that creates an issue in one of your GitHub repositories.

## Triggers

- `create_issue`
- `create_github_issue`
- `file_github_issue`

## How it works

1. Authenticates with GitHub (OAuth handled by the host).
2. Resolves the repository from a shared `github.com/<owner>/<repo>` link,
   the `repo` entity (`owner/name` or bare name matched against your
   repositories), or by asking.
3. Uses the `title` entity; if absent, asks the user for one.
4. Body comes from `body`/`description` entities or the shared text;
   `labels` entity (array) is applied when present.
5. Creates the issue and returns its link.

## Dual-mode interaction

- **Chat runs** (`ctx.execution.surface === 'chat'`): questions are asked
  inside the conversation via `synapse.prompt()`.
- **Share runs**: an HTML picker/form is shown via `synapse.ui.show()`.

## Setup

Requires a GitHub OAuth provider named `github` configured in the host,
with the `repo` scope declared in `manifest.json`.
