import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as readline from 'readline';
import chalk from 'chalk';
import { PluginManifest } from '../types';

export interface RunOptions {
    dir?: string;
    text?: string;
    url?: string;
    surface?: 'chat' | 'share';
    entity?: string[];
    json?: string;
    verbose?: boolean;
    timeout?: number;
}

export interface RunResult {
    success: boolean;
    status: 'success' | 'fail' | 'error';
    data?: any;
    error?: any;
    logs: string[];
    calls: Array<{ type: string; details: any }>;
}

/**
 * Execute a plugin action locally with simulated inputs.
 */
export async function runPlugin(trigger: string, options: RunOptions = {}): Promise<RunResult> {
    const pluginDir = path.resolve(options.dir || '.');
    const manifestPath = path.join(pluginDir, 'manifest.json');
    const pluginPath = path.join(pluginDir, 'plugin.js');

    if (!fs.existsSync(manifestPath)) {
        throw new Error(`manifest.json not found in ${pluginDir}`);
    }
    if (!fs.existsSync(pluginPath)) {
        throw new Error(`plugin.js not found in ${pluginDir}`);
    }

    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Resolve discovery triggers to the canonical action ID. Synapse invokes
    // action IDs at runtime; triggers exist only for discovery.
    const action = manifest.actions.find(a => a.id === trigger)
        ?? manifest.actions.find(a => a.triggers.includes(trigger));
    if (!action) {
        throw new Error(`Action or trigger "${trigger}" is not declared in manifest.json.`);
    }

    // Load local environment variables from .env or .synapse.env
    const env = loadLocalEnv(pluginDir);

    // Locate SDK global runtime bundle
    const sdkCode = findSdkRuntime(pluginDir);
    const pluginCode = fs.readFileSync(pluginPath, 'utf8');

    // Build mock context
    const ctx = buildMockContext(action, options);

    const logs: string[] = [];
    const calls: Array<{ type: string; details: any }> = [];
    let completed = false;
    let finalResult: RunResult = {
        success: false,
        status: 'error',
        logs,
        calls
    };

    // In-memory storage for this run
    const storage = new Map<string, any>();

    console.log(chalk.bold(`\n▶ Running action: ${chalk.cyan(action.id)} in ${chalk.gray(manifest.name)} (${manifest.id})`));
    if (trigger !== action.id) {
        console.log(`  ${chalk.gray('Matched trigger:')} ${trigger}`);
    }
    if (options.text) {
        console.log(`  ${chalk.gray('Input text:')} "${options.text}"`);
    }
    if (options.url) {
        console.log(`  ${chalk.gray('Input URL:')}  ${options.url}`);
    }
    console.log(`  ${chalk.gray('Surface:')}    ${options.surface || 'chat'}\n`);

    // Create sandbox
    const sandbox: Record<string, any> = {
        console: {
            log: (...args: any[]) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logs.push(msg);
                console.log(chalk.gray(`  [console] ${msg}`));
            },
            warn: (...args: any[]) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logs.push(`WARN: ${msg}`);
                console.warn(chalk.yellow(`  [warn] ${msg}`));
            },
            error: (...args: any[]) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logs.push(`ERROR: ${msg}`);
                console.error(chalk.red(`  [error] ${msg}`));
            }
        },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URL,
        URLSearchParams,
        fetch: globalThis.fetch,
        // Host bridge implementation (fjs native transport)
        fjs: {
            bridge_call: async (envelope: any) => {
                const type = envelope?.type;
                const payload = envelope?.payload;
                return await handleBridgeCall({
                    type,
                    payload,
                    manifest,
                    action,
                    env,
                    storage,
                    calls,
                    options,
                });
            }
        }
    };

    const context = vm.createContext(sandbox);

    // 1. Evaluate SDK
    vm.runInContext(sdkCode, context, { filename: 'synapse.global.js' });

    // 2. Evaluate Plugin
    vm.runInContext(pluginCode, context, { filename: 'plugin.js' });

    // 3. Dispatch the canonical action ID using synapse._dispatch
    const dispatchCode = `synapse._dispatch(${JSON.stringify(action.id)}, ${JSON.stringify(ctx)})`;

    try {
        const timeoutMs = options.timeout || 30000;
        const executionPromise = vm.runInContext(dispatchCode, context);

        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        const dispatchResult = await Promise.race([
            executionPromise,
            timeoutPromise
        ]);

        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }

        completed = true;
        if (dispatchResult?.status === 'success') {
            finalResult = {
                success: true,
                status: 'success',
                data: dispatchResult.data,
                logs,
                calls
            };
        } else {
            finalResult = {
                success: false,
                status: 'fail',
                error: dispatchResult?.error || dispatchResult,
                logs,
                calls
            };
        }
    } catch (err: any) {
        if (!completed) {
            finalResult = {
                success: false,
                status: 'error',
                error: { message: err.message, stack: err.stack },
                logs,
                calls
            };
        }
    }

    // Print summary
    console.log();
    if (finalResult.status === 'success') {
        console.log(chalk.green.bold('✓ Execution Succeeded'));
        if (finalResult.data !== undefined) {
            console.log(chalk.gray('Result Data:'));
            console.log(chalk.cyan(JSON.stringify(finalResult.data, null, 2)));
        }
    } else if (finalResult.status === 'fail') {
        const errorMsg = typeof finalResult.error === 'string'
            ? finalResult.error
            : (finalResult.error?.message || JSON.stringify(finalResult.error));
        const reason = typeof finalResult.error === 'object' && finalResult.error?.reason
            ? finalResult.error.reason
            : undefined;
        console.log(chalk.red.bold(`✗ Action Failed${reason ? ` (reason: ${reason})` : ''}`));
        console.log(chalk.red(`  ${errorMsg}`));
        if (typeof finalResult.error === 'object' && finalResult.error?.data) {
            console.log(chalk.gray(`  Details: ${JSON.stringify(finalResult.error.data)}`));
        }
    } else {
        console.log(chalk.red.bold('✗ Execution Error'));
        console.log(chalk.red(`  ${finalResult.error?.message || String(finalResult.error)}`));
    }
    console.log();

    return finalResult;
}

/**
 * Handle incoming bridge calls from the plugin via fjs.bridge_call
 */
async function handleBridgeCall(opts: {
    type: string;
    payload?: any;
    manifest: PluginManifest;
    action: PluginManifest['actions'][number];
    env: Record<string, string>;
    storage: Map<string, any>;
    calls: Array<{ type: string; details: any }>;
    options: RunOptions;
}): Promise<any> {
    const { type, payload, manifest, action, env, storage, calls, options } = opts;
    calls.push({ type, details: payload });

    switch (type) {
        case 'log': {
            const msg = payload?.message || JSON.stringify(payload);
            console.log(chalk.cyan(`  [log] ${msg}`));
            return undefined;
        }

        case 'finished': {
            return undefined;
        }

        case 'connection_check': {
            const alias = payload?.alias;
            const envKey = `SYNAPSE_CONNECTION_${alias.toUpperCase()}`;
            const isConfigured = !!(env[envKey] || env[alias] || process.env[envKey]);
            // Default to true in test runner unless explicitly set to false
            const isConnected = env[envKey] === 'false' ? false : true;
            if (options.verbose) {
                console.log(chalk.gray(`  [connection] check("${alias}") -> ${isConnected} (configured: ${isConfigured})`));
            }
            return isConnected;
        }

        case 'connection_connect': {
            const alias = payload?.alias;
            console.log(chalk.blue(`  [connection] connect("${alias}") established`));
            return undefined;
        }

        case 'connection_disconnect': {
            const alias = payload?.alias;
            console.log(chalk.gray(`  [connection] disconnect("${alias}")`));
            return undefined;
        }

        case 'auth_check': {
            return true;
        }

        case 'auth_authenticate': {
            return true;
        }

        case 'auth_logout': {
            return undefined;
        }

        case 'config_get': {
            const key = payload?.key;
            const envKey = `SYNAPSE_CONFIG_${key.toUpperCase()}`;
            const val = env[envKey] || env[key] || manifest.config?.find(c => c.key === key)?.default || null;
            if (options.verbose) {
                console.log(chalk.gray(`  [config] get("${key}") -> ${JSON.stringify(val)}`));
            }
            return val;
        }

        case 'config_set': {
            const { key, value } = payload;
            env[`SYNAPSE_CONFIG_${key.toUpperCase()}`] = String(value);
            console.log(chalk.gray(`  [config] set("${key}") = ${JSON.stringify(value)}`));
            return undefined;
        }

        case 'fetch': {
            const { url, method = 'GET', headers = {}, body, connection } = payload;
            console.log(chalk.magenta(`  [fetch] ${method.toUpperCase()} ${url}`) + (connection ? chalk.gray(` (connection: ${connection})`) : ''));

            const fetchHeaders: Record<string, string> = { ...headers };
            if (connection) {
                const envKey = `SYNAPSE_CONNECTION_${connection.toUpperCase()}`;
                const token = env[envKey] || env[connection] || process.env[envKey];
                if (token) {
                    fetchHeaders['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
                    if (options.verbose) {
                        console.log(chalk.gray(`    Injected token from ${envKey}`));
                    }
                }
            }

            try {
                const fetchRes = await globalThis.fetch(url, {
                    method,
                    headers: fetchHeaders,
                    body: body ? String(body) : undefined
                });

                const resText = await fetchRes.text();
                const resHeaders: Record<string, string> = {};
                fetchRes.headers.forEach((v, k) => { resHeaders[k] = v; });

                return {
                    status: fetchRes.status,
                    ok: fetchRes.ok,
                    statusText: fetchRes.statusText,
                    headers: resHeaders,
                    body: resText
                };
            } catch (err: any) {
                console.log(chalk.red(`    Fetch network error: ${err.message}`));
                return {
                    status: 0,
                    ok: false,
                    statusText: err.message,
                    headers: {},
                    body: JSON.stringify({ error: err.message })
                };
            }
        }

        case 'mcp_callTool': {
            const { serverName, toolName, arguments: toolArgs } = payload;
            console.log(chalk.blue(`  [mcp] callTool -> ${serverName}.${toolName}`) + chalk.gray(` (${JSON.stringify(toolArgs || {})})`));

            const server = manifest.mcp?.servers?.find(s => s.id === serverName);
            if (!server) {
                console.warn(chalk.yellow(`    Notice: MCP server "${serverName}" is not declared under manifest.mcp.servers`));
            }

            // Provide a realistic simulated result for testing
            let mockData: any = {
                id: 'mock-page-id-12345',
                url: `https://${serverName}.com/mock-result`,
                created: true,
                server: serverName,
                tool: toolName,
                arguments: toolArgs
            };

            if (serverName === 'notion' && toolName === 'notion-search') {
                const query = toolArgs?.query || 'General';
                mockData = {
                    results: [
                        {
                            id: 'db-meeting-notes-123',
                            object: 'database',
                            title: [{ plain_text: `${query} Notes` }],
                            url: 'https://notion.so/db-meeting-notes-123'
                        },
                        {
                            id: 'db-tasks-456',
                            object: 'database',
                            title: [{ plain_text: 'Action Items' }],
                            url: 'https://notion.so/db-tasks-456'
                        }
                    ]
                };
            }

            return {
                success: true,
                data: mockData
            };
        }

        case 'prompt': {
            const mayPrompt = action.requirements?.some(
                requirement => requirement.kind === 'host' && requirement.capability === 'com.synapse.prompt'
            ) === true;
            if (!mayPrompt) {
                return {
                    __synapseError: {
                        code: 'PERMISSION_DENIED',
                        message: 'This action did not declare the com.synapse.prompt capability.'
                    }
                };
            }
            const { message, fields = [] } = payload;
            console.log(chalk.yellow.bold(`\n  [prompt] ${message}`));

            const answers: Record<string, string> = {};

            if (process.stdin.isTTY) {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                for (const field of fields) {
                    if (field.type === 'select' && field.options?.length) {
                        console.log(chalk.gray(`    Options for "${field.label || field.name}":`));
                        field.options.forEach((opt: any, idx: number) => {
                            console.log(chalk.gray(`      [${idx + 1}] ${opt.label || opt.value} (${opt.value})`));
                        });

                        const ans = await new Promise<string>((res) => {
                            rl.question(chalk.yellow(`    Select [1-${field.options.length}] (default: 1): `), (ans) => {
                                const num = parseInt(ans.trim(), 10);
                                if (!isNaN(num) && num >= 1 && num <= field.options.length) {
                                    res(field.options[num - 1].value);
                                } else {
                                    res(field.options[0].value);
                                }
                            });
                        });
                        answers[field.name] = ans;
                    } else {
                        const ans = await new Promise<string>((res) => {
                            rl.question(chalk.yellow(`    ${field.label || field.name}${field.defaultValue ? ` [${field.defaultValue}]` : ''}: `), (ans) => {
                                res(ans.trim() || field.defaultValue || '');
                            });
                        });
                        answers[field.name] = ans;
                    }
                }
                rl.close();
                console.log();
                return { cancelled: false, values: answers };
            } else {
                for (const field of fields) {
                    answers[field.name] = field.defaultValue || (field.options?.[0]?.value ?? 'test-value');
                }
                console.log(chalk.gray(`    (Non-interactive mode, using defaults: ${JSON.stringify(answers)})`));
                return { cancelled: false, values: answers };
            }
        }

        case 'storage_get': {
            const key = payload?.key;
            const val = storage.get(key);
            if (options.verbose) {
                console.log(chalk.gray(`  [storage] get "${key}" -> ${JSON.stringify(val)}`));
            }
            return val ?? null;
        }

        case 'storage_set': {
            const { key, value } = payload;
            storage.set(key, value);
            console.log(chalk.gray(`  [storage] set "${key}" = ${JSON.stringify(value)}`));
            return undefined;
        }

        case 'storage_delete': {
            const key = payload?.key;
            storage.delete(key);
            console.log(chalk.gray(`  [storage] delete "${key}"`));
            return undefined;
        }

        case 'storage_clear': {
            storage.clear();
            console.log(chalk.gray(`  [storage] cleared`));
            return undefined;
        }

        case 'system_platform': {
            const plat = process.platform === 'darwin' ? 'macos' : (process.platform === 'win32' ? 'windows' : 'linux');
            return plat;
        }

        case 'ui_toast': {
            console.log(chalk.cyan(`  [toast] ${payload?.message}`));
            return undefined;
        }

        case 'ui_confirm': {
            console.log(chalk.cyan(`  [ui] confirm() requested: "${payload?.message}" -> auto-answering true`));
            return true;
        }

        default: {
            if (options.verbose) {
                console.log(chalk.gray(`  [bridge] unhandled message: ${type}`));
            }
            return null;
        }
    }
}

/**
 * Load .env or .synapse.env if present
 */
function loadLocalEnv(dir: string): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    const files = ['.env', '.synapse.env', '.env.local'];

    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.existsSync(fullPath)) {
            const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const idx = trimmed.indexOf('=');
                if (idx > 0) {
                    const k = trimmed.slice(0, idx).trim();
                    const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
                    env[k] = v;
                }
            }
        }
    }

    return env;
}

/**
 * Build simulated SynapseContext from CLI flags
 */
function buildMockContext(
    action: PluginManifest['actions'][number],
    options: RunOptions
) {
    if (options.json && fs.existsSync(options.json)) {
        try {
            return JSON.parse(fs.readFileSync(options.json, 'utf8'));
        } catch (e: any) {
            console.warn(chalk.yellow(`Could not parse JSON context file: ${e.message}`));
        }
    }

    const customEntities: Record<string, any> = {};
    if (options.entity) {
        for (const e of options.entity) {
            const [k, v] = e.split('=');
            if (k && v !== undefined) customEntities[k.trim()] = v.trim();
        }
    }

    const text = options.text || '';
    const isUrl = !!options.url;

    return {
        input: {
            type: isUrl ? 'url' : 'text',
            text: text,
            url: options.url,
            sourceApp: 'synapse.cli.runner'
        },
        llm: {
            intent: action.id,
            entities: {
                ...(text ? { text, title: text.slice(0, 60) } : {}),
                ...(options.url ? { url: options.url } : {}),
                ...customEntities
            },
            confidence: 0.95
        },
        user: {
            locale: 'en-US',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        },
        execution: {
            surface: options.surface || 'chat',
            capabilities: {
                prompt: action.requirements?.some(
                    requirement => requirement.kind === 'host' && requirement.capability === 'com.synapse.prompt'
                ) === true
            }
        }
    };
}

/**
 * Locate synapse runtime SDK global bundle
 */
function findSdkRuntime(pluginDir: string): string {
    const candidates = [
        path.join(pluginDir, '.synapse', 'synapse.global.js'),
        path.resolve(__dirname, '../../../dist/index.global.js'),
        path.resolve(__dirname, '../../dist/index.global.js'),
        path.resolve(__dirname, '../dist/index.global.js'),
        path.resolve(process.cwd(), 'dist/index.global.js'),
        path.resolve(process.cwd(), '../dist/index.global.js'),
        path.resolve(__dirname, '../../../flutter_example/assets/synapse.global.js'),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return fs.readFileSync(p, 'utf8');
        }
    }

    throw new Error('Could not locate Synapse SDK runtime bundle (dist/index.global.js). Please run "npm run build" in the Synapse SDK root.');
}
