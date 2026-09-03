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
    image?: string;
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

    // Verify the trigger is declared in manifest
    const action = manifest.actions.find(a => a.triggers.includes(trigger));
    if (!action) {
        console.warn(chalk.yellow(`⚠ Warning: Trigger "${trigger}" is not declared in manifest.json actions.`));
    }

    // Load local environment variables from .env or .synapse.env
    const env = loadLocalEnv(pluginDir);

    // Locate SDK global runtime bundle
    const sdkCode = findSdkRuntime(pluginDir);
    const pluginCode = fs.readFileSync(pluginPath, 'utf8');

    // Build mock context
    const ctx = buildMockContext(trigger, options);

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

    console.log(chalk.bold(`\n▶ Running intent: ${chalk.cyan(trigger)} in ${chalk.gray(manifest.name)} (${manifest.id})`));
    if (options.text) {
        console.log(`  ${chalk.gray('Input text:')} "${options.text}"`);
    }
    if (options.url) {
        console.log(`  ${chalk.gray('Input URL:')}  ${options.url}`);
    }
    console.log(`  ${chalk.gray('Surface:')}    ${options.surface || 'chat'}\n`);

    let finishResolver: (res: RunResult) => void;
    const finishPromise = new Promise<RunResult>((resolve) => {
        finishResolver = resolve;
    });

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
        // Host bridge implementation
        sendMessage: (channel: string, messageStr: string) => {
            let msg: { type: string; id?: string; payload?: any };
            try {
                msg = JSON.parse(messageStr);
            } catch {
                return;
            }

            const { type, id, payload } = msg;

            // Handle bridge message types
            handleHostMessage({
                type,
                id,
                payload,
                context,
                manifest,
                env,
                storage,
                calls,
                options,
                onFinished: (resultPayload) => {
                    completed = true;
                    if (resultPayload?.status === 'success') {
                        finalResult = {
                            success: true,
                            status: 'success',
                            data: resultPayload.data,
                            logs,
                            calls
                        };
                    } else {
                        finalResult = {
                            success: false,
                            status: 'fail',
                            error: resultPayload?.error || resultPayload,
                            logs,
                            calls
                        };
                    }
                    finishResolver(finalResult);
                }
            });
        }
    };

    const context = vm.createContext(sandbox);

    // 1. Evaluate SDK
    vm.runInContext(sdkCode, context, { filename: 'synapse.global.js' });

    // 2. Evaluate Plugin
    vm.runInContext(pluginCode, context, { filename: 'plugin.js' });

    // 3. Dispatch the intent using synapse._dispatch
    const dispatchCode = `synapse._dispatch('${trigger}', ${JSON.stringify(ctx)})`;

    try {
        const timeoutMs = options.timeout || 30000;
        const executionPromise = vm.runInContext(dispatchCode, context);

        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<RunResult>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        // Wait for either finished message or dispatch resolution
        await Promise.race([
            Promise.all([executionPromise, finishPromise]),
            timeoutPromise
        ]);

        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
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
 * Handle incoming messages sent from plugin via sendMessage('synapse', json)
 */
function handleHostMessage(opts: {
    type: string;
    id?: string;
    payload?: any;
    context: vm.Context;
    manifest: PluginManifest;
    env: Record<string, string>;
    storage: Map<string, any>;
    calls: Array<{ type: string; details: any }>;
    options: RunOptions;
    onFinished: (payload: any) => void;
}) {
    const { type, id, payload, context, manifest, env, storage, calls, options, onFinished } = opts;
    calls.push({ type, details: payload });

    // Resolve bridge asynchronously so Promise setup in SDK completes first
    const resolveBridge = (response: any, error?: string) => {
        if (!id) return;
        setTimeout(() => {
            const respStr = JSON.stringify(response ?? null);
            const errStr = error ? JSON.stringify(error) : 'null';
            const code = `synapse._bridge.resolve('${id}', ${respStr}, ${errStr})`;
            vm.runInContext(code, context);
        }, 0);
    };

    switch (type) {
        case 'log': {
            const msg = payload?.message || JSON.stringify(payload);
            console.log(chalk.cyan(`  [log] ${msg}`));
            break;
        }

        case 'finished': {
            onFinished(payload);
            break;
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
            resolveBridge(isConnected);
            break;
        }

        case 'connection_connect': {
            const alias = payload?.alias;
            console.log(chalk.blue(`  [connection] connect("${alias}") established`));
            resolveBridge(undefined);
            break;
        }

        case 'connection_disconnect': {
            const alias = payload?.alias;
            console.log(chalk.gray(`  [connection] disconnect("${alias}")`));
            resolveBridge(undefined);
            break;
        }

        case 'auth_check': {
            resolveBridge(true);
            break;
        }

        case 'auth_authenticate': {
            resolveBridge(true);
            break;
        }

        case 'auth_logout': {
            resolveBridge(undefined);
            break;
        }

        case 'config_get': {
            const key = payload?.key;
            const envKey = `SYNAPSE_CONFIG_${key.toUpperCase()}`;
            const val = env[envKey] || env[key] || manifest.config?.find(c => c.key === key)?.default || null;
            if (options.verbose) {
                console.log(chalk.gray(`  [config] get("${key}") -> ${JSON.stringify(val)}`));
            }
            resolveBridge(val);
            break;
        }

        case 'config_set': {
            const { key, value } = payload;
            env[`SYNAPSE_CONFIG_${key.toUpperCase()}`] = String(value);
            console.log(chalk.gray(`  [config] set("${key}") = ${JSON.stringify(value)}`));
            resolveBridge(undefined);
            break;
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

            (async () => {
                try {
                    const fetchRes = await globalThis.fetch(url, {
                        method,
                        headers: fetchHeaders,
                        body: body ? String(body) : undefined
                    });

                    const resText = await fetchRes.text();
                    const resHeaders: Record<string, string> = {};
                    fetchRes.headers.forEach((v, k) => { resHeaders[k] = v; });

                    resolveBridge({
                        status: fetchRes.status,
                        ok: fetchRes.ok,
                        statusText: fetchRes.statusText,
                        headers: resHeaders,
                        body: resText
                    });
                } catch (err: any) {
                    console.log(chalk.red(`    Fetch network error: ${err.message}`));
                    resolveBridge({
                        status: 0,
                        ok: false,
                        statusText: err.message,
                        headers: {},
                        body: JSON.stringify({ error: err.message })
                    });
                }
            })();
            break;
        }

        case 'mcp_callTool': {
            const { serverName, toolName, arguments: toolArgs } = payload;
            console.log(chalk.blue(`  [mcp] callTool -> ${serverName}.${toolName}`) + chalk.gray(` (${JSON.stringify(toolArgs || {})})`));

            const server = manifest.mcp?.servers?.find(s => s.id === serverName);
            if (!server) {
                console.warn(chalk.yellow(`    Notice: MCP server "${serverName}" is not declared under manifest.mcp.servers`));
            }

            // Provide a realistic simulated result for testing
            const mockData = {
                id: 'mock-page-id-12345',
                url: `https://${serverName}.com/mock-result`,
                created: true,
                server: serverName,
                tool: toolName,
                arguments: toolArgs
            };

            resolveBridge({
                success: true,
                data: mockData
            });
            break;
        }

        case 'prompt': {
            const { message, fields = [] } = payload;
            console.log(chalk.yellow.bold(`\n  [prompt] ${message}`));

            const answers: Record<string, string> = {};

            if (process.stdin.isTTY) {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                (async () => {
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
                    resolveBridge({ cancelled: false, values: answers });
                })();
            } else {
                for (const field of fields) {
                    answers[field.name] = field.defaultValue || (field.options?.[0]?.value ?? 'test-value');
                }
                console.log(chalk.gray(`    (Non-interactive mode, using defaults: ${JSON.stringify(answers)})`));
                resolveBridge({ cancelled: false, values: answers });
            }
            break;
        }

        case 'storage_get': {
            const key = payload?.key;
            const val = storage.get(key);
            if (options.verbose) {
                console.log(chalk.gray(`  [storage] get "${key}" -> ${JSON.stringify(val)}`));
            }
            resolveBridge(val ?? null);
            break;
        }

        case 'storage_set': {
            const { key, value } = payload;
            storage.set(key, value);
            console.log(chalk.gray(`  [storage] set "${key}" = ${JSON.stringify(value)}`));
            resolveBridge(undefined);
            break;
        }

        case 'storage_delete': {
            const key = payload?.key;
            storage.delete(key);
            console.log(chalk.gray(`  [storage] delete "${key}"`));
            resolveBridge(undefined);
            break;
        }

        case 'storage_clear': {
            storage.clear();
            console.log(chalk.gray(`  [storage] cleared`));
            resolveBridge(undefined);
            break;
        }

        case 'system_platform': {
            const plat = process.platform === 'darwin' ? 'macos' : (process.platform === 'win32' ? 'windows' : 'linux');
            resolveBridge(plat);
            break;
        }

        case 'ui_show': {
            console.log(chalk.cyan(`  [ui] show() requested (style: ${payload?.options?.style || 'modal'}, title: "${payload?.options?.title || 'UI'}")`));
            resolveBridge({ action: 'dismissed' });
            break;
        }

        case 'ui_toast': {
            console.log(chalk.cyan(`  [toast] ${payload?.message}`));
            resolveBridge(undefined);
            break;
        }

        case 'ui_confirm': {
            console.log(chalk.cyan(`  [ui] confirm() requested: "${payload?.message}" -> auto-answering true`));
            resolveBridge(true);
            break;
        }

        default: {
            if (options.verbose) {
                console.log(chalk.gray(`  [bridge] unhandled message: ${type}`));
            }
            resolveBridge(null);
            break;
        }
    }
}

/**
 * Load .env or .synapse.env if present
 */
function loadLocalEnv(dir: string): Record<string, string> {
    const env: Record<string, string> = {};
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
function buildMockContext(trigger: string, options: RunOptions) {
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
    const isImage = !!options.image;

    return {
        input: {
            type: isUrl ? 'url' : (isImage ? 'image' : 'text'),
            text: text,
            url: options.url,
            imageRef: options.image,
            sourceApp: 'synapse.cli.runner'
        },
        llm: {
            intent: trigger,
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
                prompt: true
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
