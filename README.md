# Synapse SDK

The **Synapse SDK** enables an "LLM-Orchestrator" architecture where a central intelligence (LLM) determines user intent, and lightweight JavaScript plugins execute the actions.

This repository contains:
1.  **JS SDK (`/`)**: The TypeScript library for building plugins.
2.  **Flutter Example (`/flutter_example`)**: A Host application demonstrating the integration.

## 📦 For Plugin Developers

The SDK provides a standard contract to communicate with the Host Application.

### Installation
```bash
npm install @synapse/sdk
```

### Usage
Interactions are handled via the global `synapse` object.

#### 1. Registering Intents
Plugins register handlers that correspond to LLM intent outputs.
```javascript
import { synapse } from '@synapse/sdk';

synapse.register('create_event', async (params) => {
  // params = { title: "Meeting", time: "10am" }
  return synapse.success({ message: "Event Created" });
});
```

#### 2. Network Requests (Sandboxed)
Plugins cannot access the internet directly. Use `synapse.net` to proxy requests through the Host.
```javascript
// GET
const res = await synapse.net.get('https://api.example.com/books');

// POST
const res = await synapse.net.post('https://api.example.com/submit', {
  data: "foo"
}, {
  'Authorization': 'Bearer ...'
});
```

### Examples

#### Data Utility
```javascript
synapse.register('clean_text', async (params) => {
  return synapse.success({ cleaned: params.text.trim() });
});
```

#### Search Plugin
```javascript
synapse.register('search', async (params) => {
  const res = await synapse.net.get(`https://api.duckduckgo.com/?q=${params.q}&format=json`);
  if (res.status === 200) {
    return synapse.success({ result: res.data });
  }
  throw new Error("Search failed");
});
```

---

## 📱 For Host Developers (Flutter)

The Host Application is responsible for the "Thinking" (LLM) and the "dispatching" (QuickJS).

### Setup
1.  Add dependencies: `flutter_js`, `http`.
2.  Load the **Synapse Interface** (built from this SDK) into the runtime.

### Dart Implementation
```dart
// 1. Initialize Engine
final engine = getJavascriptRuntime();

// 2. Load SDK
final sdkJs = await rootBundle.loadString('assets/synapse.global.js');
engine.evaluate(sdkJs);

// 3. Load Plugin
engine.evaluate(pluginSourceCode);

// 4. Dispatch Intent
final code = "synapse._dispatch('create_event', $jsonParams)";
engine.evaluate(code);
```

See [`flutter_example/lib/synapse_host.dart`](flutter_example/lib/synapse_host.dart) for the complete implementation of the **Async Bridge**.

## Build
To build the SDK bundle:
```bash
npm install
npm run build
```
Output: `dist/index.global.js`
