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
        provider: string;
        scopes?: string[];
    };

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
