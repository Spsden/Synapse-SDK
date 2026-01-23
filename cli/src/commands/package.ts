import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import chalk from 'chalk';

interface PackageOptions {
    output?: string;
    verbose?: boolean;
}


export async function packagePlugin(directory: string, options: PackageOptions): Promise<string> {
    const absDir = path.resolve(directory);

    // Check if directory exists
    if (!fs.existsSync(absDir)) {
        throw new Error(`Directory not found: ${absDir}`);
    }

    // Check for required filesx
    const manifestPath = path.join(absDir, 'manifest.json');
    const pluginPath = path.join(absDir, 'plugin.js');

    if (!fs.existsSync(manifestPath)) {
        throw new Error('manifest.json not found in plugin directory');
    }
    if (!fs.existsSync(pluginPath)) {
        throw new Error('plugin.js not found in plugin directory');
    }

    // Read and parse manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    // Read plugin script
    const pluginContent = fs.readFileSync(pluginPath, 'utf-8');

    // Calculate content hash
    const hash = crypto.createHash('sha256').update(pluginContent).digest('hex');
    const contentHash = `sha256-${hash}`;

    // Update manifest with content hash
    manifest.security = manifest.security || {};
    manifest.security.contentHash = contentHash;

    if (options.verbose) {
        console.log(chalk.gray(`  Content hash: ${contentHash}`));
    }

    // Determine output path
    const outputFile = options.output || `${manifest.id}-${manifest.version}.synx`;
    const outputPath = path.resolve(outputFile);

    if (options.verbose) {
        console.log(chalk.gray(`  Output: ${outputPath}`));
    }

    // Create the archive
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            if (options.verbose) {
                console.log(chalk.gray(`  Size: ${archive.pointer()} bytes`));
            }
            resolve(outputPath);
        });

        archive.on('error', (err) => reject(err));
        archive.pipe(output);

        // Add manifest with updated hash
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        // Add plugin.js
        archive.append(pluginContent, { name: 'plugin.js' });

        // Add optional files
        const optionalFiles = ['icon.png', 'README.md', 'LICENSE'];
        for (const file of optionalFiles) {
            const filePath = path.join(absDir, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
                if (options.verbose) {
                    console.log(chalk.gray(`  Added: ${file}`));
                }
            }
        }

        archive.finalize();
    });
}
