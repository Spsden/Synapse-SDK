import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize a new plugin project
 */
export async function initPlugin(name: string, targetDir?: string): Promise<string> {
    // Convert name to ID format
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
    const fullId = id.includes('.') ? id : `com.synapse.${id}`;

    // Determine target directory
    const dir = path.resolve(targetDir || `./${name}`);

    // Check if directory already exists
    if (fs.existsSync(dir)) {
        throw new Error(`Directory already exists: ${dir}`);
    }

    // Create directory
    fs.mkdirSync(dir, { recursive: true });

    // Create manifest.json
    const manifest = {
        id: fullId,
        name: name,
        version: '1.0.0',
        description: 'A Synapse plugin',
        author: '',

        security: {
            allowedDomains: [],
            permissions: ['network']
        },

        triggers: ['my_action'],

        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string' }
            }
        }
    };

    fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    // Create plugin.js
    const plugin = `// ${name} - Synapse Plugin
// 
// This plugin is triggered by: my_action
// 
// The context (ctx) object contains:
//   ctx.input.text     - Raw input text
//   ctx.llm.entities   - Entities extracted by the LLM
//   ctx.plugin.id      - This plugin's ID

synapse.register('my_action', async (ctx) => {
  synapse.log('${name}: my_action triggered');
  
  // Get input from context
  const text = ctx.llm.entities.text || ctx.input.text;
  
  if (!text) {
    return synapse.fail({
      reason: 'validation',
      message: 'Text is required'
    });
  }
  
  // Example: Make an API request
  // const res = await synapse.fetch('https://api.example.com/endpoint', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text })
  // });
  // 
  // if (res.ok) {
  //   const data = await res.json();
  //   return synapse.success({ data });
  // }
  
  // Return success
  return synapse.success({
    message: 'Action completed!',
    input: text
  });
});
`;

    fs.writeFileSync(path.join(dir, 'plugin.js'), plugin);

    // Create README.md
    const readme = `# ${name}

A Synapse plugin.

## Installation

\`\`\`bash
synapse package .
\`\`\`

This will create a \`.synx\` file that can be installed in Synapse.

## Triggers

- \`my_action\` - Main action trigger

## Development

Edit \`plugin.js\` to implement your plugin logic.

The Synapse SDK provides:
- \`synapse.fetch()\` - Make HTTP requests
- \`synapse.storage.get/set()\` - Store plugin data
- \`synapse.ui.toast()\` - Show toast messages
- \`synapse.auth.authenticate()\` - OAuth authentication
`;

    fs.writeFileSync(path.join(dir, 'README.md'), readme);

    return dir;
}
