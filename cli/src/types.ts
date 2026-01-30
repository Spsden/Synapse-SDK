/**
 * Manifest schema for Synapse plugins
 */
export interface PluginManifest {
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

    config?: Array<{
        key: string;
        label: string;
        type: 'text' | 'password' | 'number' | 'boolean' | 'select';
        default?: string;
        description?: string;
        required?: boolean;
        options?: string[];
    }>;

    triggers: string[];
    inputSchema?: Record<string, unknown>;
    categories?: string[];
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
