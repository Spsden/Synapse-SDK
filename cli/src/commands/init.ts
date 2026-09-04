import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize a new plugin project with full developer tooling.
 *
 * Creates:
 *   - .synapse/
 *     - manifest.schema.json — Local copy of manifest schema for offline autocomplete
 *     - synapse-global.d.ts — Full SDK type definitions with JSDoc
 *   - .vscode/
 *     - settings.json        — Schema associations, quick suggestions, checkJs
 *     - synapse.code-snippets — Editor snippets (syn-handler, syn-fetch, syn-prompt, syn-mcp, etc.)
 *     - extensions.json      — Recommended editor extensions
 *   - manifest.json          — Plugin metadata referencing ./.synapse/manifest.schema.json
 *   - plugin.js              — Annotated starter code with type reference & examples
 *   - jsconfig.json          — Configures IntelliSense for pure JS
 *   - README.md              — Plugin documentation and cheat sheet
 */
export async function initPlugin(name: string, targetDir?: string): Promise<string> {
    // Convert name to ID format (e.g. "My Plugin" -> "com.synapse.my.plugin")
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    const fullId = cleanName.includes('.') ? (cleanName.startsWith('com.') ? cleanName : `com.${cleanName}`) : `com.synapse.${cleanName}`;

    // Convert name to a trigger-friendly format (e.g. "my_plugin")
    const triggerName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    // Determine target directory
    const dir = path.resolve(targetDir || `./${name}`);

    // Check if directory already exists
    if (fs.existsSync(dir)) {
        throw new Error(`Directory already exists: ${dir}`);
    }

    // Create directories
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, '.synapse'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });

    // =========================================================================
    // .synapse/ — Copy type definitions and manifest schema
    // =========================================================================
    copyTypeDefs(dir);
    copyManifestSchema(dir);

    // =========================================================================
    // manifest.json — with local $schema for instant autocomplete
    // =========================================================================
    const manifest = {
        $schema: './.synapse/manifest.schema.json',
        manifestVersion: 2,
        id: fullId,
        name: name,
        version: '1.0.0',
        description: `A Synapse plugin for ${name}`,
        author: '',

        security: {
            allowedDomains: [],
            permissions: ['network']
        },

        connections: [],
        config: [],

        actions: [{
            id: triggerName,
            description: `Handle ${triggerName} action`,
            triggers: [triggerName],
            inputSchema: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'Input text content'
                    }
                }
            },
            outputSchema: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                    input: { type: 'string' }
                }
            }
        }],

        categories: ['productivity'],
        keywords: [triggerName]
    };

    fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
    );

    // =========================================================================
    // plugin.js — annotated with type references and guidance
    // =========================================================================
    const plugin = `// @ts-check
/// <reference path="./.synapse/synapse-global.d.ts" />

// ${name} — Synapse Plugin
//
// Trigger: ${triggerName}
//
// 💡 Editor Superpowers:
// - Type "synapse." anywhere to see available methods with full docs & examples.
// - Type "syn-" to insert ready-made snippets (syn-handler, syn-fetch, syn-prompt, syn-mcp).
// - Hover over any method or parameter to see type details and real-world examples.
// - Open manifest.json to configure triggers, permissions, connections, and hosted MCP servers.

synapse.register('${triggerName}', async (ctx) => {
  synapse.log('${name}: ${triggerName} triggered');

  // ── 1. Extract and validate input ──────────────────────────────────────────
  // ctx.input     — Raw content captured by host (text, URL, source app, etc.)
  // ctx.llm       — AI analysis (intent, entities)
  // ctx.user      — User context (locale, timezone)
  // ctx.execution — Surface context ('chat' | 'share', capabilities)

  const text = ctx.llm?.entities?.text || ctx.input?.text;

  if (!text) {
    return synapse.fail({
      reason: 'validation',
      message: 'Text input is required'
    });
  }

  // ── 2. Your custom logic here ─────────────────────────────────────────────
  // (Try typing snippets like "syn-fetch", "syn-prompt", or "syn-mcp")
  //
  // Example: Authenticated HTTP request (proxied through host)
  // const res = await synapse.fetch('https://api.example.com/endpoint', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   connection: 'my_connection', // Alias declared in manifest.json connections
  //   body: JSON.stringify({ query: text })
  // });
  //
  // Example: Call a hosted MCP server (declared in manifest.mcp.servers)
  // const mcpResult = await synapse.mcp.callTool('server-id', 'tool-name', { text });

  // ── 3. Return success result ──────────────────────────────────────────────
  return synapse.success({
    message: 'Action completed successfully!',
    input: text
  });
});
`;

    fs.writeFileSync(path.join(dir, 'plugin.js'), plugin);

    // =========================================================================
    // jsconfig.json — enables IntelliSense for plain JS
    // =========================================================================
    const jsconfig = {
        compilerOptions: {
            checkJs: true,
            target: 'ES2022',
            moduleResolution: 'node'
        },
        include: [
            '*.js',
            '.synapse/synapse-global.d.ts'
        ],
        exclude: [
            'node_modules',
            'dist'
        ]
    };

    fs.writeFileSync(
        path.join(dir, 'jsconfig.json'),
        JSON.stringify(jsconfig, null, 2) + '\n'
    );

    // =========================================================================
    // .vscode/settings.json — editor configuration
    // =========================================================================
    const vscodeSettings = {
        'js/ts.implicitProjectConfig.checkJs': true,
        'json.schemas': [
            {
                fileMatch: ['manifest.json'],
                url: './.synapse/manifest.schema.json'
            }
        ],
        'editor.quickSuggestions': {
            other: true,
            comments: true,
            strings: true
        },
        'editor.suggest.snippetsPreventQuickSuggestions': false
    };

    fs.writeFileSync(
        path.join(dir, '.vscode', 'settings.json'),
        JSON.stringify(vscodeSettings, null, 2) + '\n'
    );

    // =========================================================================
    // .vscode/synapse.code-snippets — editor shortcuts
    // =========================================================================
    const snippets = {
        'Synapse Intent Handler': {
            prefix: 'syn-handler',
            body: [
                "synapse.register('${1:trigger_name}', async (ctx) => {",
                "  synapse.log('${2:Plugin}: ' + '${1:trigger_name}' + ' called');",
                "  ",
                "  // Extract input",
                "  const text = ctx.llm?.entities?.text || ctx.input?.text;",
                "  if (!text) {",
                "    return synapse.fail({",
                "      reason: 'validation',",
                "      message: '${3:Text input is required}'",
                "    });",
                "  }",
                "  ",
                "  $0",
                "  ",
                "  return synapse.success({",
                "    message: '${4:Success!}',",
                "    data: text",
                "  });",
                "});"
            ],
            description: 'Register a new Synapse intent handler with input extraction and error checks'
        },
        'Synapse Authenticated Fetch': {
            prefix: 'syn-fetch',
            body: [
                "const res = await synapse.fetch('${1:https://api.example.com/endpoint}', {",
                "  method: '${2|GET,POST,PUT,DELETE|}',",
                "  headers: { 'Content-Type': 'application/json' },",
                "  connection: '${3:connection_alias}',",
                "  body: JSON.stringify({ ${4:key}: ${5:value} })",
                "});",
                "",
                "if (!res.ok) {",
                "  const err = await res.json().catch(() => ({}));",
                "  return synapse.fail({",
                "    reason: 'api_error',",
                "    message: err.message || 'Request failed with status ' + res.status",
                "  });",
                "}",
                "",
                "const data = await res.json();"
            ],
            description: 'Make an authenticated HTTP request using a connection declared in manifest.json'
        },
        'Synapse User Prompt': {
            prefix: 'syn-prompt',
            body: [
                "if (!ctx.execution?.capabilities?.prompt) {",
                "  return synapse.fail({",
                "    reason: 'execution_error',",
                "    message: 'Host does not support interactive prompts'",
                "  });",
                "}",
                "",
                "const answer = await synapse.prompt({",
                "  message: '${1:Please choose an option:}',",
                "  fields: [",
                "    {",
                "      name: '${2:choice}',",
                "      type: 'select',",
                "      label: '${3:Option}',",
                "      required: true,",
                "      options: [",
                "        { value: '${4:val1}', label: '${5:Label 1}' },",
                "        { value: '${6:val2}', label: '${7:Label 2}' }",
                "      ]",
                "    }",
                "  ]",
                "});",
                "",
                "if (answer.cancelled) {",
                "  return synapse.fail({ reason: 'cancelled', message: 'User cancelled prompt' });",
                "}",
                "const selected = answer.values.${2:choice};"
            ],
            description: 'Ask the user a structured question with interactive prompt'
        },
        'Synapse MCP Call Tool': {
            prefix: 'syn-mcp',
            body: [
                "const result = await synapse.mcp.callTool(",
                "  '${1:server_id}',",
                "  '${2:tool_name}',",
                "  {",
                "    ${3:param}: ${4:value}",
                "  },",
                "  { timeoutMs: 15000 }",
                ");",
                "",
                "if (!result.success) {",
                "  return synapse.fail({",
                "    reason: 'mcp_error',",
                "    message: result.error || 'MCP tool execution failed'",
                "  });",
                "}",
                "",
                "const data = result.data;"
            ],
            description: 'Call a tool on a hosted MCP server declared in manifest.mcp.servers'
        },
        'Synapse Persistent Storage': {
            prefix: 'syn-storage',
            body: [
                "await synapse.storage.set('${1:key}', ${2:value});",
                "const val = await synapse.storage.get('${1:key}');"
            ],
            description: 'Store and retrieve persistent plugin state'
        }
    };

    fs.writeFileSync(
        path.join(dir, '.vscode', 'synapse.code-snippets'),
        JSON.stringify(snippets, null, 2) + '\n'
    );

    // =========================================================================
    // .vscode/extensions.json — editor recommendations
    // =========================================================================
    const extensions = {
        recommendations: [
            'dbaeumer.vscode-eslint'
        ]
    };

    fs.writeFileSync(
        path.join(dir, '.vscode', 'extensions.json'),
        JSON.stringify(extensions, null, 2) + '\n'
    );

    // =========================================================================
    // README.md — comprehensive plugin documentation
    // =========================================================================
    const readme = `# ${name}

A Synapse plugin.

## In-Editor Developer Assistance

This project comes pre-configured with full developer tooling out of the box:

- **Autocomplete & IntelliSense**: Type \`synapse.\` in \`plugin.js\` to see all methods and APIs.
- **Hover Documentation**: Hover over any method or parameter for descriptions and real-world examples.
- **Type Checking**: Errors are caught in your editor before runtime via TypeScript/JSDoc.
- **Manifest Validation**: \`manifest.json\` has schema autocomplete for permissions, connections, and hosted MCP servers.
- **Code Snippets**: Type \`syn-handler\`, \`syn-fetch\`, \`syn-prompt\`, or \`syn-mcp\` to insert pre-built code blocks.

## Plugin Structure

\`\`\`
${name}/
├── .synapse/
│   ├── manifest.schema.json  ← Local manifest schema for autocomplete
│   └── synapse-global.d.ts   ← Full SDK type definitions
├── .vscode/
│   ├── settings.json         ← Editor settings
│   └── synapse.code-snippets ← Code snippets (syn-*)
├── jsconfig.json             ← IntelliSense configuration
├── manifest.json             ← Plugin metadata and capability contracts
├── plugin.js                 ← Plugin code (your logic goes here)
└── README.md                 ← This file
\`\`\`

## Testing Locally

Run your plugin directly from the CLI without needing a mobile device:

\`\`\`bash
synapse run ${triggerName} --text "Sample input text"
\`\`\`

## Packaging

\`\`\`bash
synapse package .
\`\`\`

Creates a \`.synx\` file ready for the Synapse app.
`;

    fs.writeFileSync(path.join(dir, 'README.md'), readme);

    return dir;
}

/**
 * Copy SDK type definitions into .synapse/ inside the plugin directory.
 */
function copyTypeDefs(pluginDir: string): void {
    const targetPath = path.join(pluginDir, '.synapse', 'synapse-global.d.ts');
    const possiblePaths = [
        path.resolve(__dirname, '../../../types/synapse-global.d.ts'),
        path.resolve(__dirname, '../../types/synapse-global.d.ts'),
        path.resolve(__dirname, '../types/synapse-global.d.ts'),
        path.resolve(process.cwd(), 'types/synapse-global.d.ts'),
        path.resolve(process.cwd(), '../types/synapse-global.d.ts'),
    ];

    for (const srcPath of possiblePaths) {
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, targetPath);
            return;
        }
    }

    // Fallback stub if types not located
    const stub = `// Synapse SDK Type Definitions\ndeclare const synapse: any;\n`;
    fs.writeFileSync(targetPath, stub);
}

/**
 * Copy manifest.schema.json into .synapse/ inside the plugin directory.
 */
function copyManifestSchema(pluginDir: string): void {
    const targetPath = path.join(pluginDir, '.synapse', 'manifest.schema.json');
    const possiblePaths = [
        path.resolve(__dirname, '../../../schemas/manifest.schema.json'),
        path.resolve(__dirname, '../../schemas/manifest.schema.json'),
        path.resolve(__dirname, '../schemas/manifest.schema.json'),
        path.resolve(process.cwd(), 'schemas/manifest.schema.json'),
        path.resolve(process.cwd(), '../schemas/manifest.schema.json'),
    ];

    for (const srcPath of possiblePaths) {
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, targetPath);
            return;
        }
    }

    // Fallback minimal schema
    fs.writeFileSync(targetPath, JSON.stringify({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "required": ["manifestVersion", "id", "name", "version", "actions"]
    }, null, 2));
}
