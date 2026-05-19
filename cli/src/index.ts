#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { packagePlugin } from './commands/package';
import { validatePlugin } from './commands/validate';
import { initPlugin } from './commands/init';

const program = new Command();

program
    .name('synapse')
    .description('CLI tool for Synapse plugin development')
    .version('1.0.0');


program
    .command('package <directory>')
    .alias('pack')
    .description('Package a plugin directory into a .synx file')
    .option('-o, --output <file>', 'Output file path')
    .option('-v, --verbose', 'Verbose output')
    .action(async (directory: string, options: { output?: string; verbose?: boolean }) => {
        try {
            const outputPath = await packagePlugin(directory, options);
            console.log(chalk.green(`✓ Package created: ${outputPath}`));
        } catch (error: any) {
            console.error(chalk.red(`✗ Error: ${error.message}`));
            process.exit(1);
        }
    });



program
    .command('validate <path>')
    .alias('verify')
    .description('Validate a .synx package or plugin directory')
    .action(async (path: string) => {
        try {
            const result = await validatePlugin(path);
            if (result.valid) {
                console.log(chalk.green(`✓ Plugin is valid`));
                console.log(chalk.gray(`  ID: ${result.manifest.id}`));
                console.log(chalk.gray(`  Name: ${result.manifest.name}`));
                console.log(chalk.gray(`  Version: ${result.manifest.version}`));
                console.log(chalk.gray(`  Triggers: ${result.manifest.triggers.join(', ')}`));
            } else {
                console.error(chalk.red(`✗ Plugin validation failed:`));
                result.errors.forEach(err => console.error(chalk.red(`  - ${err}`)));
                process.exit(1);
            }
        } catch (error: any) {
            console.error(chalk.red(`✗ Error: ${error.message}`));
            process.exit(1);
        }
    });


program
    .command('init <name>')
    .description('Initialize a new plugin project')
    .option('-d, --dir <directory>', 'Target directory (default: ./<name>)')
    .action(async (name: string, options: { dir?: string }) => {
        try {
            const dir = await initPlugin(name, options.dir);
            console.log(chalk.green(`✓ Plugin initialized: ${dir}`));
            console.log();
            console.log(chalk.bold('  Next steps:'));
            console.log(chalk.gray(`  1. Open the folder in VS Code: `) + chalk.cyan(`code ${dir}`));
            console.log(chalk.gray(`  2. Edit manifest.json — `) + chalk.gray(`autocomplete is enabled!`));
            console.log(chalk.gray(`  3. Write your plugin code in plugin.js`));
            console.log(chalk.gray(`     Type `) + chalk.cyan(`synapse.`) + chalk.gray(` for full autocomplete & docs`));
            console.log(chalk.gray(`  4. Package: `) + chalk.cyan(`synapse package ${dir}`));
        } catch (error: any) {
            console.error(chalk.red(`✗ Error: ${error.message}`));
            process.exit(1);
        }
    });


program
    .command('info <file>')
    .description('Show information about a .synx package')
    .action(async (file: string) => {
        try {
            const result = await validatePlugin(file);
            const m = result.manifest;

            console.log(chalk.bold('\n📦 Plugin Info\n'));
            console.log(`  ${chalk.gray('ID:')}          ${m.id}`);
            console.log(`  ${chalk.gray('Name:')}        ${m.name}`);
            console.log(`  ${chalk.gray('Version:')}     ${m.version}`);
            console.log(`  ${chalk.gray('Author:')}      ${m.author || 'N/A'}`);
            console.log(`  ${chalk.gray('Description:')} ${m.description || 'N/A'}`);
            console.log();
            console.log(`  ${chalk.gray('Triggers:')}    ${m.triggers.join(', ')}`);
            console.log(`  ${chalk.gray('Domains:')}     ${m.security?.allowedDomains?.join(', ') || 'None'}`);
            console.log(`  ${chalk.gray('Permissions:')} ${m.security?.permissions?.join(', ') || 'None'}`);

            if (m.auth) {
                console.log(`  ${chalk.gray('Auth:')}        ${m.auth.provider} (${m.auth.scopes?.join(', ')})`);
            }
            console.log();
        } catch (error: any) {
            console.error(chalk.red(`✗ Error: ${error.message}`));
            process.exit(1);
        }
    });

program.parse();
