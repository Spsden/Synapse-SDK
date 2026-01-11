const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Synapse SDK Mock Test ---');

// 1. Setup Mock Environment
const sandbox = {
    console: console,
    setTimeout: setTimeout,
    // Mock the flutter_js sendMessage
    sendMessage: (channel, msgStr) => {
        const msg = JSON.parse(msgStr);
        console.log(`[Host] Received message: ${msg.type}`, msg.payload);

        // Simulate Host Logic
        if (msg.type === 'network_request') {
            // Simulate async network delay
            setTimeout(() => {
                console.log('[Host] Simulating Network Response...');
                // Call back into JS
                // synapse._bridge.resolve(id, response)
                const response = { status: 200, data: { success: true } };
                const code = `synapse._bridge.resolve('${msg.id}', ${JSON.stringify(response)})`;
                vm.runInContext(code, context);
            }, 500);
        }

        if (msg.type === 'finished') {
            console.log('[Host] Action Finished:', msg.payload);
            if (msg.payload.status === 'success') {
                console.log('✅ TEST PASSED');
                process.exit(0);
            } else {
                console.log('❌ TEST FAILED');
                process.exit(1);
            }
        }
    }
};

const context = vm.createContext(sandbox);

// 2. Load SDK
console.log("Loading the SDK")
const sdkPath = path.join(__dirname, '../dist/index.global.js');
const sdkCode = fs.readFileSync(sdkPath, 'utf8');
vm.runInContext(sdkCode, context);
console.log("SDK loaded succesfully")

// 3. Load Plugin
const pluginPath = path.join(__dirname, '../example/plugin.js');
const pluginCode = fs.readFileSync(pluginPath, 'utf8');
vm.runInContext(pluginCode, context);

// 4. Trigger Action (Host -> SDK)
console.log('[Host] Dispatching Intent...');
const triggerCode = `synapse._dispatch('create_event', { title: 'Test Meeting', time: '10:00 AM' })`;
vm.runInContext(triggerCode, context);
