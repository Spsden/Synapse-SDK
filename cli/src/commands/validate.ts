import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { isIP } from 'net';
import unzipper from 'unzipper';
import { PluginManifest, PluginCategory, ValidationResult } from '../types';

const VALID_CATEGORIES: PluginCategory[] = [
    'productivity', 'communication', 'developer-tools', 'social',
    'media', 'utilities', 'finance', 'health', 'education', 'entertainment'
];

/**
 * Validate a .synx package or plugin directory
 */
export async function validatePlugin(inputPath: string): Promise<ValidationResult> {
    const absPath = path.resolve(inputPath);

    if (!fs.existsSync(absPath)) {
        throw new Error(`Path not found: ${absPath}`);
    }

    const stats = fs.statSync(absPath);

    if (stats.isDirectory()) {
        return validateDirectory(absPath);
    } else {
        return validateSynxFile(absPath);
    }
}

/**
 * Validate a plugin directory
 */
async function validateDirectory(dir: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const manifestPath = path.join(dir, 'manifest.json');
    const pluginPath = path.join(dir, 'plugin.js');

    // Check required files
    if (!fs.existsSync(manifestPath)) {
        errors.push('manifest.json not found');
    }
    if (!fs.existsSync(pluginPath)) {
        errors.push('plugin.js not found');
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings, manifest: {} as PluginManifest };
    }

    // Parse manifest
    let manifest: PluginManifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (e: any) {
        errors.push(`Invalid manifest.json: ${e.message}`);
        return { valid: false, errors, warnings, manifest: {} as PluginManifest };
    }

    // Validate manifest fields
    validateManifest(manifest, errors, warnings);

    // Verify content hash if present
    if (manifest.security?.contentHash) {
        const pluginContent = fs.readFileSync(pluginPath, 'utf-8');
        const hash = crypto.createHash('sha256').update(pluginContent).digest('hex');
        const actualHash = `sha256-${hash}`;

        if (actualHash !== manifest.security.contentHash) {
            errors.push(`Content hash mismatch: expected ${manifest.security.contentHash}, got ${actualHash}`);
        }
    }

    // Cross-validate code with manifest contracts
    const pluginContent = fs.readFileSync(pluginPath, 'utf-8');
    validateCodeAgainstManifest(manifest, pluginContent, errors, warnings);

    // Check optional files
    if (!fs.existsSync(path.join(dir, 'icon.png'))) {
        warnings.push('icon.png not found (optional)');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest,
    };
}

/**
 * Validate a .synx file
 */
async function validateSynxFile(filePath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file extension
    if (!filePath.endsWith('.synx')) {
        warnings.push('File does not have .synx extension');
    }

    // Read the zip file
    const directory = await unzipper.Open.file(filePath);

    // Find required files
    const manifestEntry = directory.files.find(f => f.path === 'manifest.json');
    const pluginEntry = directory.files.find(f => f.path === 'plugin.js');

    if (!manifestEntry) {
        errors.push('manifest.json not found in package');
    }
    if (!pluginEntry) {
        errors.push('plugin.js not found in package');
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings, manifest: {} as PluginManifest };
    }

    // Parse manifest
    let manifest: PluginManifest;
    try {
        const manifestContent = await manifestEntry!.buffer();
        manifest = JSON.parse(manifestContent.toString('utf-8'));
    } catch (e: any) {
        errors.push(`Invalid manifest.json: ${e.message}`);
        return { valid: false, errors, warnings, manifest: {} as PluginManifest };
    }

    // Validate manifest fields
    validateManifest(manifest, errors, warnings);

    // Verify content hash
    if (manifest.security?.contentHash) {
        const pluginContent = await pluginEntry!.buffer();
        const hash = crypto.createHash('sha256').update(pluginContent).digest('hex');
        const actualHash = `sha256-${hash}`;

        if (actualHash !== manifest.security.contentHash) {
            errors.push(`Content hash mismatch: expected ${manifest.security.contentHash}, got ${actualHash}`);
        }
    }

    // Cross-validate code with manifest contracts
    const pluginContent = (await pluginEntry!.buffer()).toString('utf-8');
    validateCodeAgainstManifest(manifest, pluginContent, errors, warnings);

    // Check for optional files
    const hasIcon = directory.files.some(f => f.path === 'icon.png');
    if (!hasIcon) {
        warnings.push('icon.png not found in package (optional)');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest,
    };
}

/**
 * Validate manifest fields against schemas/manifest.schema.json
 */
export function validateManifest(manifest: PluginManifest, errors: string[], warnings: string[]): void {
    // Required fields
    if (!manifest.id) {
        errors.push('manifest.id is required');
    } else if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(manifest.id)) {
        errors.push('manifest.id must be in reverse domain notation (e.g., com.author.plugin)');
    }

    if (!manifest.name) {
        errors.push('manifest.name is required');
    } else if (manifest.name.length > 50) {
        errors.push('manifest.name must be 50 characters or less');
    }

    if (!manifest.version) {
        errors.push('manifest.version is required');
    } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        errors.push('manifest.version must be in semver format (x.y.z)');
    }

    if (manifest.manifestVersion !== 2) {
        errors.push('manifest.manifestVersion must be 2');
    }
    if (!manifest.actions || manifest.actions.length === 0) {
        errors.push('manifest.actions must have at least one action');
    }

    // Legacy v1 field detection
    const rawManifest = manifest as unknown as Record<string, unknown>;
    for (const legacyField of ['triggers', 'inputSchema', 'auth', 'mcpServers']) {
        if (Object.prototype.hasOwnProperty.call(rawManifest, legacyField)) {
            errors.push(`manifest.${legacyField} is a manifest v1 field; declare it in manifest v2 action contracts`);
        }
    }

    // Optional fields validation
    if (!manifest.description) {
        warnings.push('manifest.description is recommended');
    } else if (manifest.description.length > 200) {
        errors.push('manifest.description must be 200 characters or less');
    }

    if (!manifest.author) {
        warnings.push('manifest.author is recommended');
    }

    if (manifest.authorUrl && !/^https?:\/\/.+/.test(manifest.authorUrl)) {
        errors.push('manifest.authorUrl must be a valid URI');
    }

    if (manifest.homepage && !/^https?:\/\/.+/.test(manifest.homepage)) {
        errors.push('manifest.homepage must be a valid URI');
    }

    if (manifest.minSynapseVersion && !/^\d+\.\d+\.\d+$/.test(manifest.minSynapseVersion)) {
        errors.push('manifest.minSynapseVersion must be in semver format (x.y.z)');
    }

    // Security
    if (manifest.security) {
        if (manifest.security.allowedApps && !manifest.security.permissions?.includes('applescript')) {
            warnings.push('manifest.security.allowedApps is specified but "applescript" permission is not included');
        }
    }

    if (!manifest.security?.allowedDomains || manifest.security.allowedDomains.length === 0) {
        warnings.push('No allowed domains specified - plugin cannot make direct network requests');
    }

    // Named connections
    const connectionAliases = new Set<string>();
    if (manifest.connections) {
        manifest.connections.forEach((connection, index) => {
            if (!connection.alias) {
                errors.push(`manifest.connections[${index}].alias is required`);
            } else if (!/^[a-z][a-z0-9_-]*$/.test(connection.alias)) {
                errors.push(`manifest.connections[${index}].alias must match ^[a-z][a-z0-9_-]*$`);
            } else if (connectionAliases.has(connection.alias)) {
                errors.push(`manifest.connections: duplicate alias "${connection.alias}"`);

            } else {
                connectionAliases.add(connection.alias);
            }
            if (!connection.provider) {
                errors.push(`manifest.connections[${index}].provider is required`);
            } else if (!/^[a-z][a-z0-9_-]*$/.test(connection.provider)) {
                errors.push(`manifest.connections[${index}].provider must match ^[a-z][a-z0-9_-]*$`);
            }
            if (!['oauth2', 'api_key', 'none'].includes(connection.type)) {
                errors.push(
                    `manifest.connections[${index}].type must be one of: oauth2, api_key, none`,
                );
            }
        });
    }

    // Package-owned hosted MCP servers. There is intentionally no local,
    // stdio, command, or cloud-routing alternative in this contract.
    const hostedMcpServerIds = new Set<string>();
    if (manifest.mcp) {
        if (!Array.isArray(manifest.mcp.servers) || manifest.mcp.servers.length === 0) {
            errors.push('manifest.mcp.servers must contain at least one hosted server');
        } else {
            manifest.mcp.servers.forEach((server, index) => {
                const serverPath = `manifest.mcp.servers[${index}]`;
                if (!server.id) {
                    errors.push(`${serverPath}.id is required`);
                } else if (!/^[a-z][a-z0-9-]*$/.test(server.id)) {
                    errors.push(`${serverPath}.id must match ^[a-z][a-z0-9-]*$`);
                } else if (hostedMcpServerIds.has(server.id)) {
                    errors.push(`manifest.mcp.servers: duplicate id "${server.id}"`);
                } else {
                    hostedMcpServerIds.add(server.id);
                }

                validateHostedMcpEndpoint(server.endpoint, `${serverPath}.endpoint`, errors);
                if (!['oauth', 'none'].includes(server.authentication)) {
                    errors.push(`${serverPath}.authentication must be one of: oauth, none`);
                }
            });
        }
    }

    // Config
    if (manifest.config) {
        if (!Array.isArray(manifest.config)) {
            errors.push('manifest.config must be an array');
        } else {
            manifest.config.forEach((field, index) => {
                if (!field.key) {
                    errors.push(`manifest.config[${index}].key is required`);
                } else if (!/^[a-z_][a-z0-9_]*$/.test(field.key)) {
                    errors.push(`manifest.config[${index}].key must match ^[a-z_][a-z0-9_]*$`);
                }
                if (!field.label) errors.push(`manifest.config[${index}].label is required`);
                if (!['text', 'password', 'number', 'boolean', 'select'].includes(field.type)) {
                    errors.push(`manifest.config[${index}].type must be one of: text, password, number, boolean, select`);
                }
                if (field.type === 'select' && (!field.options || field.options.length === 0)) {
                    errors.push(`manifest.config[${index}].options is required when type is select`);
                }
            });
        }
    }

    // Actions
    if (manifest.actions) {
        const actionIds = new Set<string>();
        const actionTriggers = new Set<string>();
        let hasMcpRequirement = false;

        manifest.actions.forEach((action, actionIndex) => {
            if (!action.id) {
                errors.push(`manifest.actions[${actionIndex}].id is required`);
            } else if (!/^[a-z][a-z0-9_]*$/.test(action.id)) {
                errors.push(`manifest.actions[${actionIndex}].id must match ^[a-z][a-z0-9_]*$`);
            } else if (actionIds.has(action.id)) {
                errors.push(`manifest.actions: duplicate action id "${action.id}"`);
            } else {
                actionIds.add(action.id);
            }

            if (!action.triggers || action.triggers.length === 0) {
                errors.push(`manifest.actions[${actionIndex}].triggers must list at least one trigger`);
            } else {
                action.triggers.forEach((trigger) => {
                    if (!/^[a-z][a-z0-9_]*$/.test(trigger)) {
                        errors.push(`manifest.actions[${actionIndex}]: trigger "${trigger}" must match ^[a-z][a-z0-9_]*$`);
                    }
                    if (actionTriggers.has(trigger)) {
                        errors.push(`manifest.actions: trigger "${trigger}" is assigned more than once`);
                    }
                    actionTriggers.add(trigger);
                });
            }

            // Validate platforms
            if (action.platforms) {
                const validPlatforms = ['ios', 'android', 'macos', 'windows', 'linux', 'web'];
                action.platforms.forEach((platform) => {
                    if (!validPlatforms.includes(platform)) {
                        errors.push(`manifest.actions[${actionIndex}]: invalid platform "${platform}"`);
                    }
                });
            }

            // Validate requirements
            action.requirements?.forEach((requirement, requirementIndex) => {
                const reqPath = `manifest.actions[${actionIndex}].requirements[${requirementIndex}]`;
                if (requirement.kind === 'connection') {
                    if (!requirement.alias) {
                        errors.push(`${reqPath}.alias is required`);
                    } else if (!connectionAliases.has(requirement.alias)) {
                        errors.push(`${reqPath} references unknown connection alias "${requirement.alias}"`);
                    }
                } else if (requirement.kind === 'mcp') {
                    hasMcpRequirement = true;
                    if (!requirement.serverId) {
                        errors.push(`${reqPath}.serverId is required`);
                    } else if (!/^[a-z][a-z0-9-]*$/.test(requirement.serverId)) {
                        errors.push(`${reqPath}.serverId must match ^[a-z][a-z0-9-]*$`);
                    } else if (!hostedMcpServerIds.has(requirement.serverId)) {
                        errors.push(`${reqPath}.serverId references unknown hosted server "${requirement.serverId}"`);
                    }
                    if (!requirement.allow?.tools?.length) {
                        errors.push(`${reqPath}.allow.tools must list at least one tool name`);
                    }
                } else if (requirement.kind === 'host') {
                    if (!requirement.capability) {
                        errors.push(`${reqPath}.capability is required`);
                    } else if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(requirement.capability)) {
                        errors.push(`${reqPath}.capability must be in reverse domain notation`);
                    }
                } else if (requirement.kind === 'network') {
                    if (!requirement.domains?.length) {
                        errors.push(`${reqPath}.domains must list at least one domain`);
                    }
                }
            });
        });

        if (hasMcpRequirement && !manifest.security?.permissions?.includes('mcp')) {
            errors.push('manifest.actions declares an MCP requirement but security.permissions does not include "mcp"');
        }
    }

    // Categories
    if (manifest.categories) {
        manifest.categories.forEach((category) => {
            if (!VALID_CATEGORIES.includes(category)) {
                errors.push(`manifest.categories: invalid category "${category}"`);
            }
        });
    }

    // Keywords
    if (manifest.keywords) {
        if (manifest.keywords.length > 10) {
            errors.push('manifest.keywords must have 10 items or less');
        }
    }
}

function validateHostedMcpEndpoint(endpoint: unknown, path: string, errors: string[]): void {
    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
        errors.push(`${path} is required`);
        return;
    }

    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        errors.push(`${path} must be an absolute HTTPS URL`);
        return;
    }

    if (url.protocol !== 'https:' || !url.hostname) {
        errors.push(`${path} must be an absolute HTTPS URL`);
    }
    if (url.username || url.password || url.hash) {
        errors.push(`${path} must not include credentials or a fragment`);
    }
    if (isLocalOrPrivateHost(url.hostname)) {
        errors.push(`${path} must not target localhost or a private network`);
    }
}

function isLocalOrPrivateHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
        return true;
    }

    if (isIP(host) === 4) {
        const [first, second] = host.split('.').map(Number);
        return first === 10 ||
            first === 127 ||
            first === 0 ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168);
    }

    if (isIP(host) === 6) {
        return host === '::1' ||
            host.startsWith('fc') ||
            host.startsWith('fd') ||
            host.startsWith('fe80:');
    }
    return false;
}

/**
 * Cross-validate plugin code (plugin.js) against manifest declarations.
 */
export function validateCodeAgainstManifest(
    manifest: PluginManifest,
    code: string,
    errors: string[],
    warnings: string[]
): void {
    const permissions = manifest.security?.permissions || [];

    // Strip comments so commented-out examples don't trigger false warnings
    const activeCode = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

    // 1. Check triggers
    const allTriggers = manifest.actions?.flatMap(a => a.triggers) || [];
    for (const trigger of allTriggers) {
        if (!code.includes(trigger)) {
            warnings.push(`Action trigger "${trigger}" declared in manifest.json is not found in plugin.js.`);
        }
    }

    // 2. Check connections
    const connectionRegex = /connection\s*:\s*['"]([a-z0-9_-]+)['"]/g;
    let match: RegExpExecArray | null;
    const declaredConnections = new Set(manifest.connections?.map(c => c.alias) || []);
    while ((match = connectionRegex.exec(activeCode)) !== null) {
        const alias = match[1];
        if (!declaredConnections.has(alias)) {
            warnings.push(`Connection alias "${alias}" used in plugin.js is not declared under manifest.connections.`);
        }
    }

    // 3. Check MCP calls
    const mcpRegex = /synapse\.mcp\.callTool\(\s*['"]([a-z0-9_-]+)['"]\s*,\s*['"]([a-z0-9_-]+)['"]/g;
    const declaredMcpServers = new Set(manifest.mcp?.servers?.map(s => s.id) || []);
    while ((match = mcpRegex.exec(activeCode)) !== null) {
        const serverId = match[1];
        const toolName = match[2];

        if (!permissions.includes('mcp')) {
            warnings.push(`plugin.js calls synapse.mcp.callTool() but "mcp" permission is not listed in manifest.security.permissions.`);
        }

        if (!declaredMcpServers.has(serverId)) {
            warnings.push(`plugin.js calls MCP server "${serverId}", but it is not declared under manifest.mcp.servers.`);
        }
    }

    // 4. Check permissions
    if (activeCode.includes('synapse.fetch(') && !permissions.includes('network')) {
        warnings.push(`plugin.js calls synapse.fetch() but "network" permission is not listed in manifest.security.permissions.`);
    }

    if (activeCode.includes('synapse.system.calendar') && !permissions.includes('calendar')) {
        warnings.push(`plugin.js calls calendar APIs but "calendar" permission is not listed in manifest.security.permissions.`);
    }

    if (activeCode.includes('synapse.system.runAppleScript') && !permissions.includes('applescript')) {
        warnings.push(`plugin.js calls runAppleScript() but "applescript" permission is not listed in manifest.security.permissions.`);
    }
}
