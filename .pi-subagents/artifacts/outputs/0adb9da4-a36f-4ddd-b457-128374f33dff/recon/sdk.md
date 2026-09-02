# Synapse SDK + Packaging CLI — READ-ONLY Recon

Repo: `/Users/pratap/code/Synapse-SDK`
Branch: `feature/mcp-support`
Working tree: `M cli/package-lock.json`, `M flutter_example/pubspec.lock` (uncommitted lockfiles — **NOT touched** per instructions).
Toolchain: Node/TypeScript (SDK via `tsup`, CLI via `tsc`); Flutter/Dart reference host (`flutter_js`). Package manager: **npm** (`package-lock.json`).

> Scope note: This repo contains the **plugin SDK** (`src/`), the **packaging CLI** (`cli/`), the **manifest schema** (`schemas/`), and a **Flutter reference host** (`flutter_example/`). It does **not** contain the Marketplace registry, the desktop runtime, or the LLM intent router — those live elsewhere. Several topics in the task (capability intersection, Agent Skills, signing) are therefore answered as "not present here" with pointers to where they would live.

---

## 1. Repository layout

```
Synapse-SDK/
├── package.json            # @synapse/sdk — the JS plugin runtime SDK
├── tsconfig.json           # SDK TS config (ES2020, CommonJS, strict)
├── tsup.config.ts          # SDK bundler config
├── src/                    # SDK source
│   ├── index.ts            # barrel export
│   ├── synapse.ts          # Synapse class + all namespaces (fetch/ui/auth/storage/config/mcp/system/connections/upload)
│   ├── bridge.ts           # host <-> JS message bridge (flutter_js sendMessage)
│   └── types.ts            # all SDK TS types
├── types/
│   └── synapse-global.d.ts # ambient global typings shipped to plugin authors (the `synapse` global)
├── schemas/
│   └── manifest.schema.json# JSON Schema (Draft-07) for manifest v2 (the ONLY schema; v1 was deleted)
├── cli/                    # @synapse/cli — packaging CLI (separate package.json + tsconfig)
│   ├── package.json        # bin: synapse + synx -> dist/index.js; deps: commander, archiver, unzipper, chalk
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts        # commander program: package / validate / init / info
│       ├── types.ts        # PluginManifest + ValidationResult (mirrors schema)
│       └── commands/
│           ├── package.ts  # .synx archive builder + sha256 contentHash
│           ├── validate.ts # validateManifest() + dir/.synx validation (THIS is the validation logic)
│           └── init.ts     # scaffolds a new plugin dir
├── plugins/
│   └── notion/             # canonical v2 example plugin (manifest.json + plugin.js + README + jsconfig)
├── example/
│   └── plugin.js           # legacy example plugin (create_event) used by test_mock.js
├── notion_plugin/          # empty
├── notion_mcp_plugin/      # only .vscode/
├── docs/
│   └── MANIFEST_V2.md      # v2 design rationale (action-centric permissions, MCP registry merge model)
├── flutter_example/        # Flutter reference host (the real "runtime contract" lives here)
│   └── lib/synapse_host.dart
├── test/
│   ├── test_mock.js        # vm-based harness; loads dist/index.global.js + example/plugin.js
│   └── test_mcp.js         # vm-based harness for mcp.callTool success/tool-error/bridge-error cases
├── dist/                   # SDK build output (ignored by .gitignore, present on disk)
└── workspace_config.yaml   # pi workspace config (unrelated to plugin packaging)
```

### Build/run commands
- SDK: `npm run build` → `tsup` (`src/index.ts` → `dist/{index.js,index.mjs,index.global.js,index.d.ts}`); formats iife+cjs+esm, `globalName: SynapseSDK`, sourcemaps on, minify off.
- SDK test: `npm test` → `node test/test_mock.js` (loads built `dist/index.global.js` in a Node `vm` sandbox with a mocked `sendMessage`). **Not** a real test framework — no jest/vitest, no assertions lib; `process.exit(0/1)` is the signal.
- MCP test: `node test/test_mcp.js` (NOT wired into `npm test`).
- CLI: in `cli/`, `npm run build` → `tsc && chmod +x dist/index.js`; `npm start` → `node dist/index.js`; `npm run dev` → `ts-node src/index.ts`.
- No lint, no type-check CI script beyond the `tsc` step, no license/dependency analysis, no secret-scanning tooling present (verified: no eslint/prettier/jest/vitest/license-checker/.secretlintrc anywhere outside `node_modules`).

---

## 2. The CLI (`cli/`)

### Entry points
- `cli/src/index.ts:1-118` — commander program. Binary: `synapse` / `synx` → `dist/index.js` (shebang `#!/usr/bin/env node`).
- Commands (all defined here):
  - `package <directory>` (alias `pack`) — options `-o/--output`, `-v/--verbose` → `packagePlugin()` (`cli/src/commands/package.ts:14`).
  - `validate <path>` (alias `verify`) → `validatePlugin()` (`cli/src/commands/validate.ts:11`). Accepts **both a plugin directory and a `.synx` file**.
  - `init <name>` — option `-d/--dir` → `initPlugin()` (`cli/src/commands/init.ts:11`).
  - `info <file>` — **reuses `validatePlugin()`** to parse a `.synx` and print metadata (`cli/src/index.ts:79`).

### `@synapse/cli` deps (`cli/package.json`)
- Runtime: `commander ^12`, `archiver ^7`, `unzipper ^0.12`, `chalk ^4`.
- Dev: `@types/archiver`, `@types/node`, `@types/unzipper`, `ts-node`, `typescript ^5.3`.

### How a plugin dir is structured by `init`
`init.ts` scaffolds (`cli/src/commands/init.ts:20-260`): `manifest.json` (with `$schema` for editor autocomplete), `plugin.js` (annotated starter using the `synapse` global), `jsconfig.json` (checkJs), `synapse-global.d.ts` (copied from SDK `types/`), `README.md`, `.vscode/settings.json` (manifest↔schema association). Manifest skeleton it writes:
```jsonc
{ "$schema": "./node_modules/@synapse/sdk/schemas/manifest.schema.json",
  "manifestVersion": 2, "id": "com.synapse.<name>", "name": "<name>", "version": "1.0.0",
  "security": { "allowedDomains": [], "permissions": ["network"] },
  "connections": [], "config": [],
  "actions": [{ "id": "<trigger>", "triggers": ["<trigger>"],
                "inputSchema": { "type":"object","properties": { "text": {"type":"string"} } } }] }
```

---

## 3. `.synx` package format

### Archive structure
Built in `cli/src/commands/package.ts:62-105` using `archiver('zip', { zlib: { level: 9 } })`. Entries appended **in a fixed source order**:
1. `manifest.json` — re-serialized with `JSON.stringify(manifest, null, 2)` (pretty-printed, 2-space).
2. `plugin.js` — raw file contents.
3. Optional, if present on disk, in this order: `icon.png`, `README.md`, `LICENSE`.

> **No recursive directory bundling.** Only the three optional filenames above are picked up. There is **no `assets/` directory support**, no nested folders, no globbing. (Plugins reference assets by `blob://` refs handed to them by the host at runtime, not by bundling files.)

### Hashing / signing today
- `package.ts:47-49`: `contentHash = "sha256-" + sha256(plugin.js UTF-8)`. Written back into `manifest.security.contentHash` before the manifest is added to the zip. The hash is **of `plugin.js` text only** — it does **not** cover the manifest itself, `icon.png`, `README.md`, or `LICENSE`.
- **No package-level signature, no detached signature, no key identity, no certificate chain.** The `contentHash` is an integrity check, not an authenticity proof. (Task asked about signing — answer: none exists.)

### Determinism — **NOT deterministic today**
- `archiver` is invoked with **no determinism options**: no fixed timestamps (`forceLocalTime`/`date` per-entry not set), no `store: true`, no forced entry-order sort, no `dos` time normalization. `archiver`/`zlib` embed the **current wall-clock time** in each ZIP entry header and may vary CRC/sizes with zlib version. Output filename default `${id}-${version}.synx` is stable, but the **byte content is not reproducible** across runs/machines.
- `manifest.json` is re-serialized with `JSON.stringify(..., null, 2)`; field order follows JS object insertion order (stable in V8), but nothing canonicalizes keys.
- **Conclusion:** to get reproducible `.synx`, you'd need to (a) pin per-entry timestamps to a fixed epoch, (b) sort entries, (c) canonicalize/normalize the manifest JSON, and (d) likely hash the whole archive for a package digest.

---

## 4. Manifest v2 schema (verbatim)

Schema file: `schemas/manifest.schema.json` (Draft-07, `$id https://synapse.dev/schemas/manifest.schema.json`, `additionalProperties: false`). This is the **only** schema — v1 was removed in commit `f08d104 "refactor(plugin): remove manifest v1 artifacts"` (the v1-era `triggers`/`inputSchema`/`auth`/`mcpServers` top-level fields, example plugins, and sample `.synx` files were all deleted).

### Top-level fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `manifestVersion` | integer, **const 2** | ✅ | "Synapse accepts version 2 only." |
| `$schema` | string | – | editor autocomplete ref |
| `id` | string, regex `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$` | ✅ | reverse-domain e.g. `com.notion.add` |
| `name` | string (1–50) | ✅ | display name |
| `version` | string, `^\d+\.\d+\.\d+$` | ✅ | semver |
| `description` | string (≤200) | – | |
| `author` | string | – | |
| `authorUrl` | string (`uri`) | – | |
| `homepage` | string (`uri`) | – | |
| `license` | string | – | SPDX |
| `minSynapseVersion` | string semver | – | |
| `security` | object (`additionalProperties:false`) | – | see below |
| `connections` | array (uniqueItems) | – | named user connections |
| `config` | array | – | settings UI fields |
| `actions` | array (**minItems 1**) | ✅ | action contracts |
| `categories` | array, enum | – | marketplace discovery |
| `keywords` | array (≤10) | – | search |

### `security` (verbatim fields)
- `allowedDomains`: `string[]` (`uniqueItems`) — "Domains the plugin is allowed to make network requests to. Only these domains will be reachable via `synapse.fetch()`."
- `permissions`: `string[]` (`uniqueItems`), each matching `^(network|ui|storage|config|calendar|applescript|shortcuts|intents|mcp|[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+|network:[a-z0-9.-]+)$` — legacy flat name **or** scoped capability (`calendar.read`, `network:api.example.com`).
- `contentHash`: string — "SHA-256 hash of plugin.js (auto-generated by `synapse package`). Do not edit manually."
- `allowedApps`: `string[]` (`uniqueItems`) — "macOS apps the plugin is allowed to target via AppleScript (required if using `applescript` permission)."

### `connections[]` (each `additionalProperties:false`, top-level array `uniqueItems:true`)
Required: `alias`, `provider`, `type`.
- `alias`: `^[a-z][a-z0-9_-]*$`
- `provider`: `^[a-z][a-z0-9_-]*$`
- `type`: enum `oauth2 | api_key | mcp_oauth | none`
- `scopes`: `string[]` (`uniqueItems`)
- `optional`: boolean (default false)

### `config[]` (each `additionalProperties:false`)
Required: `key`, `label`, `type`.
- `key`: `^[a-z_][a-z0-9_]*$`
- `label`: string
- `type`: enum `text | password | number | boolean | select`
- `default`: string
- `description`: string
- `required`: boolean (default false)
- `options`: `string[]` — **required when `type === "select"`** (enforced via `if/then`).

### `actions[]` (the v2 core; each `additionalProperties:false`)
Required: `id`, `triggers`.
- `id`: `^[a-z][a-z0-9_]*$`
- `description`: string
- `triggers`: `string[]` (`^[a-z][a-z0-9_]*$`, **minItems 1, uniqueItems**)
- `inputSchema`: object (free-form — not a full JSON-Schema subschema)
- `outputSchema`: object (free-form)
- `platforms`: array, enum `ios | android | macos | windows | linux | web` (`uniqueItems`)
- `requirements`: array, **oneOf** union (see below)

### `actions[].requirements[]` — the capability contract (verbatim `oneOf`)
1. `{ kind: "connection", alias }` — `alias` `^[a-z][a-z0-9_-]*$`; must match a top-level `connections[].alias`.
2. `{ kind: "mcp", alias, serverId, allow: { tools: string[] (minItems 1, uniqueItems) }, optional? }` — MCP tool allowlist.
3. `{ kind: "host", capability, optional? }` — `capability` is reverse-domain `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`.
4. `{ kind: "network", domains: string[] (minItems 1, uniqueItems), optional? }`

All four `additionalProperties:false`.

> Canonical example: `plugins/notion/manifest.json` — declares a `mcp_oauth` connection alias `notion`, a single action `add_to_notion` with triggers `[add_to_notion, save_to_notion]`, `inputSchema`/`outputSchema`, and two requirements: a `connection` on alias `notion` plus an `mcp` requirement (`serverId: notion`, `allow.tools: ["notion-create-pages"]`). `security.permissions: ["mcp","config"]`.

---

## 5. Existing manifest validation logic

Two layers exist, **both in the CLI**, both hand-written (no ajv/json-schema runtime validation — the JSON Schema is for editor tooling only):

### A. `validateManifest()` — `cli/src/commands/validate.ts:112-225`
Called by both `packagePlugin` and `validatePlugin`. Errors are strings pushed into `errors[]` (warnings into `warnings[]`). Checks implemented:
- **Required fields:** `id` (+ regex `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$`), `name`, `version` (`^\d+\.\d+\.\d+$`), `manifestVersion === 2`, `actions` non-empty. ⚠️ Note: the validator's `id` regex here (`validate.ts:120`) **differs** from the schema's (`schema` allows hyphens; validator regex does not) — a latent inconsistency.
- **v1 rejection:** any top-level `triggers`, `inputSchema`, `auth`, or `mcpServers` key → error ("manifest v1 field; declare it in manifest v2 action contracts"). This is the **backward-compat gate**: v1 packages are explicitly refused.
- **Connections:** each must have `alias`/`provider`; alias **uniqueness** enforced; `type` ∈ {oauth2, api_key, mcp_oauth, none}.
- **Actions:** `id` required + **uniqueness across actions**; `triggers` non-empty; **trigger uniqueness across the whole manifest** (a trigger may be assigned to exactly one action).
- **Action requirements:**
  - `connection` → alias must exist in top-level `connections` (referential integrity).
  - `mcp` → `allow.tools` must be non-empty; sets a `hasMcpRequirement` flag.
  - `host` → `capability` required.
  - `network` → `domains` non-empty.
- **Cross-check:** if any action declares an `mcp` requirement but `security.permissions` does **not** include `"mcp"` → error (`validate.ts:200-202`).
- **Config:** array; each needs `key`/`label`; `type` validated; `select` requires non-empty `options`.
- **Warnings (not errors):** missing `description`, missing `author`, no `security.allowedDomains` ("plugin cannot make network requests").

### B. `validatePlugin()` — directory + `.synx` validation — `cli/src/commands/validate.ts:11-110`
- **Directory mode:** requires `manifest.json` + `plugin.js`; parses manifest; runs `validateManifest`; if `security.contentHash` present, recomputes `sha256-<plugin.js>` and **errors on mismatch**; warns if `icon.png` missing.
- **`.synx` mode:** requires `.synx` extension (warns otherwise); opens via `unzipper.Open.file`; locates `manifest.json` + `plugin.js` entries; parses; runs `validateManifest`; recomputes+compares contentHash; warns if no `icon.png`.

### What is NOT validated today (gaps to flag)
- **I/O schemas:** `inputSchema`/`outputSchema` are free-form `object` in the schema and **never validated structurally** (no sub-schema, no `ajv`, no required-properties check). The validator does not even confirm they're valid JSON Schema fragments.
- **MCP `serverId` existence:** the validator does not (and cannot, in this repo) resolve `serverId` against the Marketplace registry — that's the host/registry's job (see `docs/MANIFEST_V2.md`: the registry supplies reviewed auth profiles + deployments; the runtime enforces both allowlists).
- **MCP tool-name vs. registry:** `allow.tools` is checked for non-empty only; no validation that the named tools actually exist on the server.
- **`host.capability` availability:** declared but never intersected with actual platform capabilities (intersection happens in the host runtime, not here).
- **`network.domains` vs `security.allowedDomains`:** the two are independent; the validator does not reconcile action-level `network` domains with the top-level allowlist.
- **`platforms`:** accepted but never enforced (no platform-filtering logic in this repo).
- **`permissions` pattern:** not re-checked by the validator (only the `mcp` cross-check).
- **JSON Schema itself:** never loaded/applied at runtime — `additionalProperties:false` and `oneOf` constraints in the schema are **not enforced** by `validateManifest`. This means a stray field passes CLI validation but would still be "wrong" by schema.

---

## 6. FJS / QuickJS host contract

### Runtime
The reference host is Flutter, using the **`flutter_js`** package (which wraps **QuickJS** on Android/iOS / JavaScriptCore on some platforms). See `flutter_example/lib/synapse_host.dart:3,42`.

- `SynapseHost.init()` (`synapse_host.dart:38-46`) creates the JS runtime and registers an `onMessage('synapse', ...)` channel.
- `loadSdk(sdkSource)` (`:100`) → `_engine.evaluate(sdkSource)` — loads the built IIFE bundle (`dist/index.global.js`, `globalName: SynapseSDK`) which **exposes `synapse` on `globalThis`** (`src/synapse.ts` final lines).
- `loadPlugin(pluginSource, pluginId)` (`:105`) → `_engine.evaluate(pluginSource)` — the plugin runs in the **same global context** as the SDK (single shared scope; no per-plugin JS isolate in this reference).
- `dispatch(intent, params, pluginId?)` (`:67`) → evaluates `synapse._dispatch('$intent', <paramsJson>)`.

### What `plugin.js` must export / do
There is **no module export contract.** A plugin is plain JS that runs once at load time and **registers handlers via the global `synapse` object**:
- `synapse.register(intent, async (ctx) => SynapseResult)` (`src/synapse.ts` `register`, ~`:96`) — stores handler in a `Map`.
- The host later calls `synapse._dispatch(intent, params)` (`src/synapse.ts` `_dispatch`, ~`:118`), which builds a `SynapseContext` (`{input, llm, user}`) from params, looks up the handler, awaits it, and `Bridge.send('finished', result)`. Unhandled handler errors → `fail({reason:'execution_error'})`; missing handler → `fail({reason:'not_implemented'})`.
- Handlers return `synapse.success({...,link})` or `synapse.fail({reason,message,retryable})` (`src/synapse.ts` `success`/`fail`).

### The sandbox / bridge protocol (`src/bridge.ts`)
- **Outbound:** `Bridge.send(type, payload, expectResponse?)`. Builds `{type, id, payload}`, JSON-stringifies, and calls the host-injected `sendMessage('synapse', json)` global (`bridge.ts:43-52`). If `expectResponse`, registers a Promise keyed by `id` in `pendingRequests`.
- **Inbound:** host calls `synapse._bridge.resolve(id, response, error?)` (via `_engine.evaluate(...)` in Dart, `synapse_host.dart:475-482`) → `Bridge.handleResponse` resolves/rejects the pending promise.
- When `sendMessage` is **not** a function (e.g., running under Node tests), the bridge falls back to `console.warn('[SynapseBridge] Mock send:', message)` — fire-and-forget.

### Capability model exposed to plugins (`src/synapse.ts` namespaces)
- `fetch(url, init?)` → `Bridge.send('fetch', ...)`; host injects OAuth/auth via `init.provider` (legacy) or `init.connection` (v2 alias). Network is **always host-proxied**; the plugin has no raw socket.
- `ui` (`show`/`toast`/`confirm`), `auth` (`isAuthenticated`/`authenticate`/`logout`), `connections` (`isConnected`/`connect`/`disconnect` — v2), `storage` (`get`/`set`/`delete`/`clear`), `config` (`get`/`set`), `system` (`platform`/`runShortcut`/`sendIntent`/`runAppleScript`/`calendar.*`), `upload(...)`.
- `mcp.callTool<TResponse,TArgs>(serverName, toolName, args?, options?)` → `Bridge.send('mcp_callTool', {serverName, toolName, arguments, options:{timeoutMs, routingPolicy}})`. Returns a **wrapped** `McpCallResult<T>` `{success, data?, error?, code?}`; try/catch wraps catastrophic/bridge errors as `{success:false, code:'BRIDGE_ERROR'}`. `routingPolicy` ∈ `prefer-local | local-only | cloud-only` (`src/types.ts` `McpCallOptions`).

### Host-side handlers actually implemented in the reference
`synapse_host.dart` `_handleBridgeMessage` switch (`:121-190`): `fetch`, `network_request` (legacy alias → same handler), `ui_show`, `ui_toast`, `ui_confirm`, `auth_check`, `auth_authenticate`, `auth_logout`, `storage_get/set/delete/clear`, `upload`, `finished`, `log`. ⚠️ The reference host does **not** yet handle `connection_*`, `config_*`, `system_*`, or `mcp_callTool` messages — those arrive as `default:` ("Unknown message type"). The reference host therefore **predates the v2 MCP/connection surface**; a real host must implement the rest.

---

## 7. Agent Skill support — **NOT PRESENT**

Searched the entire tree (excluding `node_modules`/`dist`) for `skill`, `SKILL.md`, `synapse.skill.json`, `references/`, `scripts/`, `assets/` (as plugin assets). Findings:
- No `SKILL.md` files.
- No `synapse.skill.json` or any `*skill*` files.
- No `references/`, `scripts/`, or `assets/` directories inside the plugin packaging path. The only "assets" reference is `flutter_example/pubspec.yaml:67` (`assets/synapse.global.js`) and `README.md` example — i.e., Flutter bundle assets, unrelated to plugin skill packaging.
- The `.synx` packager bundles only `manifest.json`, `plugin.js`, and optionally `icon.png`/`README.md`/`LICENSE` — there is **no path for SKILL.md/references/scripts into the archive.**
- `workspace_config.yaml` (a `pi` workspace config with `agents/tools/connections/knowledge_bases/toolkits/models` folders) is **unrelated** to the plugin package format.

**Conclusion:** Agent Skill support does not exist in this repo. Adding it would require new manifest fields, new schema entries, new bundling logic in `package.ts`, new validation, and likely new SDK/host plumbing.

---

## 8. Capability intersection model — **manifest-declared only; runtime intersection not implemented here**

- **Declaration** (manifest v2): per-action `requirements[]` express the four `kind`s (connection/mcp/host/network) plus top-level `security.permissions` and `security.allowedDomains`. The `optional` flag marks a requirement as non-blocking (`requirements[]` items 2–4 support `optional`; `connection` does not).
- **Validation** (`validate.ts`): only checks **internal consistency** — connection aliases resolve, mcp tools non-empty, host capability present, network domains non-empty, and the `mcp`↔`security.permissions` cross-check. It does **not** intersect anything with runtime state.
- **Runtime intersection** (the "should be" model) lives **outside this repo**: per `docs/MANIFEST_V2.md`, the merge is intentionally one-way — (1) manifest supplies action/alias/serverId/allowlist; (2) **Marketplace registry** supplies reviewed auth profiles, artifacts, and platform deployments; (3) the **runtime selects a compatible deployment and enforces both allowlists**. Local developer MCP commands (`MCP_DEVELOPER_CONFIG_PATH`) are user config, not registry deployments, and cannot be submitted to the Marketplace.
- So: `session capabilities ∩ skill-declared requirements ∩ user grants ∩ platform availability` is **conceptually specified in docs but has no implementation in this SDK repo** — it is the host/registry's responsibility. The SDK exposes the *primitives* (`connections.connect`, `mcp.callTool` allowlist enforcement is expected host-side) but not the intersection engine.

---

## 9. Tooling & determinism summary

| Concern | Status | Where |
|---|---|---|
| Build (SDK) | `tsup` IIFE+CJS+ESM, sourcemaps, no minify | `tsup.config.ts` |
| Build (CLI) | `tsc` | `cli/tsconfig.json`, `cli/package.json` |
| Type checking | `tsc --strict` (both SDK & CLI); no standalone `typecheck` script | `tsconfig.json`, `cli/tsconfig.json` |
| Tests | Ad-hoc `node vm` harnesses; `npm test` → `test_mock.js` only; `test_mcp.js` not wired in | `test/`, `package.json` scripts |
| Test framework | **None** (no jest/vitest/mocha) | — |
| Lint | **None** (no eslint/prettier config) | — |
| Dependency/license analysis | **None** | — |
| Secret scanning | **None** | — |
| Pack determinism | **Not deterministic** — archiver w/ no timestamp/store/sort options; manifest re-serialized non-canonically | `cli/src/commands/package.ts:62-105` |
| Hashing | SHA-256 of `plugin.js` only → `security.contentHash` | `package.ts:47-49` |
| Signing | **None** | — |
| JSON-Schema runtime validation | **None** — schema is editor-only; `validateManifest` is hand-rolled and diverges from schema in places (e.g. `id` regex) | `schemas/`, `validate.ts` |

---

## 10. Backward-compatibility constraints (existing `.synx` packages)

1. **Manifest v1 is hard-broken by design.** Commit `f08d104` deleted all v1 artifacts; `validateManifest` **rejects** any top-level `triggers`, `inputSchema`, `auth`, or `mcpServers`, and requires `manifestVersion: 2`. Any pre-existing v1 `.synx` will fail `validate`/`package`. There is **no v1→v2 migration shim** in the repo.
2. **`contentHash` semantics:** stored as `sha256-<hex>` over `plugin.js` UTF-8 text. Existing packages with this field will be re-verified on load; a `package` re-run **overwrites** it. If you change the hashing algorithm or scope (e.g. to cover the manifest or whole archive), old packages' stored hashes will mismatch and fail validation unless a version flag distinguishes them — there is currently **no hash-version field**.
3. **Entry set is fixed** to `manifest.json`, `plugin.js`, `icon.png`, `README.md`, `LICENSE`. Any package carrying other files (e.g., if future SKILL/assets support is added) is **ignored by the validator** (`unzipper` only looks for `manifest.json` + `plugin.js`); it won't error but won't inspect them either.
4. **Reference host lags the SDK surface.** `flutter_example` doesn't handle `connection_*`/`config_*`/`system_*`/`mcp_callTool` — real hosts must, or v2 MCP/connection plugins silently no-op.
5. **No signing today** means any backward-compat move to signed packages must decide whether unsigned legacy packages are still loadable and on what trust basis.

---

## Files Retrieved
1. `package.json` — SDK package identity, exports, build/test scripts.
2. `tsconfig.json`, `tsup.config.ts` — SDK build config (ES2020, strict; tsup iife+cjs+esm).
3. `schemas/manifest.schema.json` (full) — the manifest v2 JSON Schema (verbatim in §4).
4. `cli/package.json`, `cli/tsconfig.json` — CLI package, bin, deps.
5. `cli/src/index.ts` (1-118) — commander program; commands `package`/`validate`/`init`/`info`.
6. `cli/src/types.ts` (full) — `PluginManifest` + `ValidationResult` TS interfaces mirroring the schema.
7. `cli/src/commands/package.ts` (1-108) — `.synx` archive build + sha256 contentHash; determinism analysis.
8. `cli/src/commands/validate.ts` (1-225) — `validatePlugin` + `validateManifest` (the validation logic in §5).
9. `cli/src/commands/init.ts` (1-260) — plugin scaffolding.
10. `src/index.ts`, `src/synapse.ts`, `src/bridge.ts`, `src/types.ts` (full) — SDK runtime, bridge protocol, all types.
11. `types/synapse-global.d.ts` (full) — ambient `synapse` global shipped to plugin authors.
12. `plugins/notion/manifest.json`, `plugins/notion/plugin.js` — canonical v2 plugin.
13. `flutter_example/lib/synapse_host.dart` (full) — reference host (QuickJS via flutter_js) and bridge message handlers.
14. `docs/MANIFEST_V2.md`, `README.md` — v2 design + CLI/SDK docs.
15. `test/test_mock.js`, `test/test_mcp.js`, `example/plugin.js` — the only "tests" (vm harnesses).

## Key Code
- **Packaging/hashing:** `cli/src/commands/package.ts:47-105` — sha256 over plugin.js only; archiver zlib level 9, no determinism.
- **All manifest validation:** `cli/src/commands/validate.ts:112-225` (`validateManifest`) + `:11-110` (`validatePlugin` dir/.synx).
- **Host bridge contract:** `src/bridge.ts` (full) + `flutter_example/lib/synapse_host.dart:121-190`.
- **Plugin execution entry:** `src/synapse.ts` `register`/`_dispatch` + global exposure at file end.
- **MCP call path:** `src/synapse.ts` `mcp.callTool` + `src/types.ts` `McpCallOptions`/`McpCallResult`.

## Architecture
`plugin.js` (+ `manifest.json`) → packaged by **CLI** (`archiver`) into `.synx` (zip with embedded `sha256-` contentHash) → validated by **CLI** (`validateManifest`, hand-rolled) → at runtime loaded into a **QuickJS/flutter_js** sandbox by the host; plugin calls the **global `synapse`** (from the IIFE SDK bundle) which talks to the host over a **JSON `sendMessage`/`_bridge.resolve` channel**. Manifest v2 `actions[].requirements[]` declare connection/mcp/host/network needs; the **Marketplace registry + runtime host** (outside this repo) resolve and enforce them.

## Start Here
Open `cli/src/commands/validate.ts` first — it contains **all** existing manifest validation (`validateManifest` at `:112`) and the dir/`.synx` validators; this is the single point that governs what a `.synx` must look like and where any new validation (schemas, skills, deterministic packaging checks, signing) must be wired. Pair it with `cli/src/commands/package.ts` for the build path and `schemas/manifest.schema.json` for the authoritative (but editor-only) contract.

## Supervisor coordination
None required — read-only recon complete; no decision or unblock needed.
