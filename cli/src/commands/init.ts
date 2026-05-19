import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize a new plugin project with full developer tooling.
 * 
 * Creates:
 *   - manifest.json       — Plugin metadata with $schema for autocomplete
 *   - plugin.js           — Annotated starter code with type references
 *   - jsconfig.json       — Enables IntelliSense for the synapse global
 *   - synapse-global.d.ts — Type definitions (copied from SDK)
 *   - README.md           — Plugin documentation
 *   - .vscode/settings.json — Editor settings
 */
export async function initPlugin(name: string, targetDir?: string): Promise<string> {
    // Convert name to ID format
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
    const fullId = id.includes('.') ? id : `com.synapse.${id}`;

    // Convert name to a trigger-friendly format
    const triggerName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Determine target directory
    const dir = path.resolve(targetDir || `./${name}`);

    // Check if directory already exists
    if (fs.existsSync(dir)) {
        throw new Error(`Directory already exists: ${dir}`);
    }

    // Create directories
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });

    // =========================================================================
    // manifest.json — with $schema for autocomplete
    // =========================================================================

    const manifest = {
        $schema: './node_modules/@synapse/sdk/schemas/manifest.schema.json',
        id: fullId,
        name: name,
        version: '1.0.0',
        description: `A Synapse plugin for ${name}`,
        author: '',

        security: {
            allowedDomains: [],
            permissions: ['network']
        },

        auth: {
            type: 'none'
        },

        config: [],

        triggers: [triggerName],

        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string' }
            }
        }
    };

    fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
    );

    // =========================================================================
    // plugin.js — annotated with type references
    // =========================================================================

    const plugin = `// @ts-check
/// <reference path="./synapse-global.d.ts" />

// ${name} — Synapse Plugin
//
// Triggers: ${triggerName}
//
// SDK Quick Reference:
//   synapse.register()          — Handle an intent
//   synapse.fetch()             — HTTP requests (proxied through host)
//   synapse.ui.show()           — Display custom HTML UI
//   synapse.ui.toast()          — Show a brief message
//   synapse.auth.authenticate() — Trigger OAuth flow
//   synapse.storage.get/set()   — Persistent key-value storage
//   synapse.success() / .fail() — Return results
//
// Full docs: type "synapse." and let autocomplete guide you!

synapse.register('${triggerName}', async (ctx) => {
  synapse.log('${name}: ${triggerName} triggered');

  // ── Extract input ───────────────────────────────────────────────────────
  // ctx.input  — The shared content (text, image, URL, etc.)
  // ctx.llm    — AI analysis: detected intent + extracted entities
  // ctx.user   — User context: locale, timezone

  const text = ctx.llm.entities.text || ctx.input.text;

  if (!text) {
    return synapse.fail({
      reason: 'validation',
      message: 'Text input is required'
    });
  }

  // ── Make API requests ───────────────────────────────────────────────────
  // Uncomment and modify for your use case:
  //
  // const res = await synapse.fetch('https://api.example.com/endpoint', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text }),
  //   provider: 'my_provider'  // Host injects OAuth Authorization header
  // });
  //
  // if (!res.ok) {
  //   const err = await res.json().catch(() => ({}));
  //   return synapse.fail({
  //     reason: 'api_error',
  //     message: err.message || 'Request failed'
  //   });
  // }
  //
  // const data = await res.json();

  // ── Return result ───────────────────────────────────────────────────────
  return synapse.success({
    message: 'Action completed!',
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
            target: 'ES2020',
            moduleResolution: 'node',
            types: []
        },
        include: [
            '*.js',
            'synapse-global.d.ts'
        ],
        exclude: [
            'node_modules'
        ]
    };

    fs.writeFileSync(
        path.join(dir, 'jsconfig.json'),
        JSON.stringify(jsconfig, null, 2) + '\n'
    );

    // =========================================================================
    // synapse-global.d.ts — copy type definitions into the plugin project
    // =========================================================================

    copyTypeDefs(dir);

    // =========================================================================
    // .vscode/settings.json — editor configuration
    // =========================================================================

    const vscodeSettings = {
        // Enable TypeScript checking for JavaScript files
        'js/ts.implicitProjectConfig.checkJs': true,
        // Associate manifest.json with the schema
        'json.schemas': [
            {
                fileMatch: ['manifest.json'],
                url: './node_modules/@synapse/sdk/schemas/manifest.schema.json'
            }
        ],
        // Recommend useful extensions
        'editor.quickSuggestions': {
            other: true,
            comments: false,
            strings: true
        }
    };

    fs.writeFileSync(
        path.join(dir, '.vscode', 'settings.json'),
        JSON.stringify(vscodeSettings, null, 2) + '\n'
    );

    // =========================================================================
    // README.md — comprehensive plugin documentation
    // =========================================================================

    const readme = `# ${name}

A Synapse plugin.

## Development Setup

This plugin comes with full editor support out of the box:

- **Autocomplete** — Type \`synapse.\` in \`plugin.js\` and see all available methods
- **Hover docs** — Hover over any method for documentation and examples
- **Type checking** — Errors are caught in your editor before runtime
- **Manifest validation** — \`manifest.json\` has autocomplete for all fields

### Prerequisites

Open this folder in VS Code (or any editor with TypeScript support).
IntelliSense works automatically — no \`npm install\` required.

## Plugin Structure

\`\`\`
${name}/
├── manifest.json          ← Plugin metadata, permissions, triggers
├── plugin.js              ← Plugin code (your logic goes here)
├── jsconfig.json          ← Editor config for IntelliSense
├── synapse-global.d.ts    ← SDK type definitions (do not edit)
├── README.md              ← This file
└── .vscode/
    └── settings.json      ← VS Code settings
\`\`\`

## Triggers

- \`${triggerName}\` — Main action trigger

## Packaging

\`\`\`bash
synapse package .
\`\`\`

This creates a \`.synx\` file that can be installed in Synapse.

## SDK Quick Reference

\`\`\`javascript
// Intent handling
synapse.register('intent_name', async (ctx) => { ... });
synapse.success({ data });
synapse.fail({ reason: '...', message: '...' });
synapse.log('debug message');

// Network (all requests proxied through host)
const res = await synapse.fetch(url, { method, headers, body, provider });
await res.json();
await res.text();
res.ok / res.status / res.statusText

// UI
const result = await synapse.ui.show(html, { title, width, height });
await synapse.ui.toast('message');
const yes = await synapse.ui.confirm('question?');

// Authentication (host-managed OAuth)
await synapse.auth.authenticate('provider');
await synapse.auth.isAuthenticated('provider');
await synapse.auth.logout('provider');

// Storage (persistent, per-plugin)
await synapse.storage.set('key', value);
const val = await synapse.storage.get('key');
await synapse.storage.delete('key');

// Config (encrypted settings from manifest.json)
const apiKey = await synapse.config.get('key');

// System (platform-specific)
const platform = await synapse.system.platform();
await synapse.system.runShortcut('name', input);          // iOS/macOS
await synapse.system.sendIntent({ action, extras });      // Android
await synapse.system.runAppleScript('tell app ...');      // macOS
await synapse.system.calendar.createEvent({ title, ... }); // iOS/macOS

// File uploads
await synapse.upload({ fileRef, url, provider });
\`\`\`

For full documentation, type \`synapse.\` in your editor and explore with autocomplete!
`;

    fs.writeFileSync(path.join(dir, 'README.md'), readme);

    return dir;
}

/**
 * Copy the SDK type definitions into the plugin directory.
 * Looks for synapse-global.d.ts in several possible locations
 * relative to where the CLI is installed.
 */
function copyTypeDefs(pluginDir: string): void {
    const possiblePaths = [
        // When CLI is run from the SDK repo (development)
        path.resolve(__dirname, '../../../types/synapse-global.d.ts'),
        // When CLI is run from the SDK repo (dist)
        path.resolve(__dirname, '../../types/synapse-global.d.ts'),
        // When installed as a package alongside @synapse/sdk
        path.resolve(__dirname, '../../../sdk/types/synapse-global.d.ts'),
        // Fallback: look up from CWD
        path.resolve(process.cwd(), 'types/synapse-global.d.ts'),
    ];

    for (const srcPath of possiblePaths) {
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(pluginDir, 'synapse-global.d.ts'));
            return;
        }
    }

    // If we can't find the type definitions, write a stub with a helpful comment
    const stub = `// Synapse SDK Type Definitions
//
// This file should contain the full Synapse SDK type definitions.
// To get the latest version, copy synapse-global.d.ts from the
// Synapse SDK repository: types/synapse-global.d.ts
//
// Or run: synapse init --refresh-types

/** @type {any} */
declare const synapse: any;
declare const SynapseBridge: { postMessage(data: any): void };
`;

    fs.writeFileSync(path.join(pluginDir, 'synapse-global.d.ts'), stub);
}
