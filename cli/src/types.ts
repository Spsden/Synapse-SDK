/**
 * Manifest schema for Synapse plugins
 */
export interface PluginManifest {
    /** Manifest contract version. Omitted means legacy manifest v1. */
    manifestVersion?: 1 | 2;
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    authorUrl?: string;
    homepage?: string;
    license?: string;
    minSynapseVersion?: string;

    security?: {
        allowedDomains?: string[];
        permissions?: string[];
        contentHash?: string;
    };

    auth?: {
        type: 'oauth2' | 'api_key' | 'none';
        provider?: string;
        scopes?: string[];
    };

    /** Named user connections available to manifest v2 actions. */
    connections?: Array<{
        alias: string;
        provider: string;
        type: 'oauth2' | 'api_key' | 'mcp_oauth' | 'none';
        scopes?: string[];
        optional?: boolean;
    }>;

    config?: Array<{
        key: string;
        label: string;
        type: 'text' | 'password' | 'number' | 'boolean' | 'select';
        default?: string;
        description?: string;
        required?: boolean;
        options?: string[];
    }>;

    triggers?: string[];
    /** Action-specific contracts. Required for manifest v2. */
    actions?: Array<{
        id: string;
        description?: string;
        triggers: string[];
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        requirements?: Array<
            | {
                kind: 'connection';
                alias: string;
            }
            | {
                kind: 'mcp';
                alias: string;
                serverId: string;
                allow: {
                    tools: string[];
                };
                optional?: boolean;
            }
            | {
                kind: 'host';
                capability: string;
                optional?: boolean;
            }
            | {
                kind: 'network';
                domains: string[];
                optional?: boolean;
            }
        >;
        platforms?: Array<'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web'>;
    }>;
    inputSchema?: Record<string, unknown>;
    categories?: string[];
    keywords?: string[];

    mcpServers?: Array<{
        /** Unique local name used as first arg to synapse.mcp.callTool(name, ...) */
        name: string;
        /** Human-readable description shown in the host approval UI */
        description?: string;
        /** Allowlist of tool names the plugin is permitted to call */
        tools: string[];
    }>;
}

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    manifest: PluginManifest;
}
