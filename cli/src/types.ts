/**
 * Manifest schema for Synapse plugins
 *
 * Mirrors schemas/manifest.schema.json and src/types.ts.
 */

export type ConnectionType = 'oauth2' | 'api_key' | 'mcp_oauth' | 'none';

export type PluginCapabilityRequirement =
    | { kind: 'connection'; alias: string }
    | {
        kind: 'mcp';
        alias: string;
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
