const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Synapse SDK MCP Namespace Test ---');

let lastMessage = null;

// 1. Setup Mock Environment
const sandbox = {
    console: console,
    setTimeout: setTimeout,
    // Mock the fjs bridge_call
    fjs: {
        bridge_call: async (envelope) => {
            if (envelope.type === 'mcp_callTool') {
                const { serverName, toolName } = envelope.payload;
                console.log(`[Host] Received callTool request for: ${serverName}.${toolName}`);

                if (toolName === 'get-success') {
                    return { success: true, data: { song: 'Fly Me to the Moon' } };
                } else if (toolName === 'get-tool-error') {
                    return { success: false, error: 'Database connection failed', code: 'DB_ERROR' };
                } else if (toolName === 'get-bridge-error') {
                    return { __synapseError: { code: 'BRIDGE_ERROR', message: 'Bridge connection timeout' } };
                }
            }
            return null;
        }
    }
};

const context = vm.createContext(sandbox);

// 2. Load SDK
const sdkPath = path.join(__dirname, '../dist/index.global.js');
const sdkCode = fs.readFileSync(sdkPath, 'utf8');
vm.runInContext(sdkCode, context);
console.log('✅ SDK loaded successfully');

// 3. Test Runner
async function runTests() {
    // Inject async runner in sandbox
    sandbox.run = async () => {
        const synapse = sandbox.synapse;

        console.log('\n--- Running Test 1: Successful Tool Execution ---');
        const res1 = await synapse.mcp.callTool('spotify', 'get-success', { trackId: '123' }, { timeoutMs: 3000 });
        console.log('Result 1:', JSON.stringify(res1));
        if (res1.success && res1.data && res1.data.song === 'Fly Me to the Moon') {
            console.log('✅ Test 1 Passed');
        } else {
            console.log('❌ Test 1 Failed');
            process.exit(1);
        }

        console.log('\n--- Running Test 2: Tool Failure Handling ---');
        const res2 = await synapse.mcp.callTool('notion', 'get-tool-error');
        console.log('Result 2:', JSON.stringify(res2));
        if (!res2.success && res2.error === 'Database connection failed' && res2.code === 'DB_ERROR') {
            console.log('✅ Test 2 Passed');
        } else {
            console.log('❌ Test 2 Failed');
            process.exit(1);
        }

        console.log('\n--- Running Test 3: Catastrophic/Bridge Failure Handling ---');
        const res3 = await synapse.mcp.callTool('spotify', 'get-bridge-error');
        console.log('Result 3:', JSON.stringify(res3));
        if (!res3.success && res3.error.includes('Bridge connection timeout') && res3.code === 'BRIDGE_ERROR') {
            console.log('✅ Test 3 Passed');
        } else {
            console.log('❌ Test 3 Failed');
            process.exit(1);
        }

        console.log('\n🎉 ALL MCP TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    };

    vm.runInContext('run()', context);
}

runTests().catch(err => {
    console.error('Test Execution crashed:', err);
    process.exit(1);
});
