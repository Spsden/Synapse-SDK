/**
 * Manifest schema for Synapse plugins
 *
 * Mirrors schemas/manifest.schema.json and src/types.ts.
 */

export type ConnectionType = 'oauth2' | 'api_key' | 'mcp_oauth' | 'none';

/** A remote MCP server owned by the plugin package author. */
export interface HostedMcpServer {
    /** Package-local identifier used by actions and synapse.mcp.callTool(). */
    id: string;
    /** Absolute HTTPS Streamable HTTP MCP endpoint. */
    endpoint: string;
    /** Whether Synapse must establish an MCP OAuth connection first. */
    authentication: 'oauth' | 'none';
}

export type PluginCapabilityRequirement =
    | { kind: 'connection'; alias: string }
    | {
        kind: 'mcp';
        serverId: string;
        allow: { tools: string[] };
        optional?: boolean;
    }
    | { kind: 'host'; capability: string; optional?: boolean }
    | { kind: 'network'; domains: string[]; optional?: boolean };

export type SynapsePlatform = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'web';

export type PluginCategory =
    | 'productivity' | 'communication' | 'developer-tools' | 'social'
    | 'media' | 'utilities' | 'finance' | 'health' | 'education' | 'entertainment';

export interface PluginManifest {
    /** Manifest contract version. Synapse accepts version 2 only. */
    manifestVersion: 2;
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
        allowedApps?: string[];
    };

    /** Named user connections available to actions. */
    connections?: Array<{
        alias: string;
        provider: string;
        type: ConnectionType;
        scopes?: string[];
        optional?: boolean;
    }>;

    /** Hosted-only MCP servers declared by this package. */
    mcp?: {
        servers: HostedMcpServer[];
    };

    config?: Array<{
        key: string;
        label: string;
        type: 'text' | 'password' | 'number' | 'boolean' | 'select';
        default?: string;
        description?: string;
        required?: boolean;
        options?: string[];
    }>;

    /** Action-specific execution and capability contracts. */
    actions: Array<{
        id: string;
        description?: string;
        triggers: string[];
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        requirements?: PluginCapabilityRequirement[];
        platforms?: SynapsePlatform[];
    }>;

    categories?: PluginCategory[];
    keywords?: string[];
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
