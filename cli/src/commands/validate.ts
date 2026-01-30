import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import unzipper from 'unzipper';
import { PluginManifest, ValidationResult } from '../types';

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
 * Validate manifest fields
 */
function validateManifest(manifest: PluginManifest, errors: string[], warnings: string[]): void {
    // Required fields
    if (!manifest.id) {
        errors.push('manifest.id is required');
    } else if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(manifest.id)) {
        errors.push('manifest.id must be in reverse domain notation (e.g., com.author.plugin)');
    }

    if (!manifest.name) {
        errors.push('manifest.name is required');
    }

    if (!manifest.version) {
        errors.push('manifest.version is required');
    } else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        errors.push('manifest.version must be in semver format (x.y.z)');
    }

    if (!manifest.triggers || manifest.triggers.length === 0) {
        errors.push('manifest.triggers must have at least one trigger');
    }

    // Optional but recommended
    if (!manifest.description) {
        warnings.push('manifest.description is recommended');
    }
    if (!manifest.author) {
        warnings.push('manifest.author is recommended');
    }

    // Auth
    if (manifest.auth) {
        if (!['oauth2', 'api_key', 'none'].includes(manifest.auth.type)) {
            errors.push('manifest.auth.type must be one of: oauth2, api_key, none');
        }
        if (manifest.auth.type === 'oauth2' && !manifest.auth.provider) {
            errors.push('manifest.auth.provider is required when auth.type is oauth2');
        }
    }

    // Config
    if (manifest.config) {
        if (!Array.isArray(manifest.config)) {
            errors.push('manifest.config must be an array');
        } else {
            manifest.config.forEach((field, index) => {
                if (!field.key) errors.push(`manifest.config[${index}].key is required`);
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

    // Security
    if (!manifest.security?.allowedDomains || manifest.security.allowedDomains.length === 0) {
        warnings.push('No allowed domains specified - plugin cannot make network requests');
    }
}
