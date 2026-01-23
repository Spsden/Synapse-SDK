import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'synapse_host.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Synapse SDK Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const SynapseTestScreen(),
    );
  }
}

class SynapseTestScreen extends StatefulWidget {
  const SynapseTestScreen({super.key});

  @override
  State<SynapseTestScreen> createState() => _SynapseTestScreenState();
}

class _SynapseTestScreenState extends State<SynapseTestScreen> {
  final _host = SynapseHost();
  String _status = 'Idle';
  String _result = '';
  bool _isInit = false;
  final List<String> _logs = [];

  @override
  void initState() {
    print("starts here");
    super.initState();
    _initSynapse();
  }

  void _log(String message) {
    setState(() {
      _logs.add('[${DateTime.now().toString().substring(11, 19)}] $message');
      if (_logs.length > 20) _logs.removeAt(0);
    });
  }

  Future<void> _initSynapse() async {
    _log('Initializing Synapse Host...');
    await _host.init();

    // Load SDK
    final sdkJs = await rootBundle.loadString('assets/synapse.global.js');
    await _host.loadSdk(sdkJs);
    _log('SDK loaded');

    // Load Google Keep Plugin
    try {
      final keepManifest = await rootBundle.loadString('assets/plugins/com.synapse.google.keep/manifest.json');
      final keepScript = await rootBundle.loadString('assets/plugins/com.synapse.google.keep/plugin.js');
      await _host.loadPlugin(keepScript, pluginId: 'com.synapse.google.keep');
      _log('Google Keep Plugin loaded');
    } catch (e) {
      _log('Failed to load Google Keep: $e');
    }

    // ==========================================================================
    // Example Plugin using NEW SDK API
    // ==========================================================================
    const pluginJs = """
      // Plugin: create_event
      // Demonstrates: fetch API, context object, storage
      synapse.register('create_event', async (ctx) => {
        // Access the new context structure
        const { title, time } = ctx.llm.entities;
        
        if (!title) {
          return synapse.fail({ reason: 'validation', message: 'Title is required' });
        }

        // Use the new fetch API (mirrors browser fetch)
        const res = await synapse.fetch('https://jsonplaceholder.typicode.com/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: title,
            email: 'user@synapse.com',
            body: time || 'No time specified',
            postId: 1,
          })
        });

        // Use familiar Response API
        if (res.ok) {
          const data = await res.json();
          
          // Store last created event in plugin storage
          await synapse.storage.set('lastEvent', { title, id: data.id });
          
          return synapse.success({
            id: data.id,
            message: 'Event created!',
            serverResponse: data
          });
        } else {
          return synapse.fail({ 
            reason: 'api_error', 
            message: 'Server returned ' + res.status + ': ' + res.statusText 
          });
        }
      });

      // Plugin: search
      // Demonstrates: GET request with fetch
      synapse.register('search', async (ctx) => {
        const query = ctx.llm.entities.query || ctx.input.text;
        
        const res = await synapse.fetch(
          'https://jsonplaceholder.typicode.com/posts?userId=' + encodeURIComponent(query)
        );
        
        if (res.ok) {
          const results = await res.json();
          return synapse.success({ count: results.length, results });
        }
        
        return synapse.fail({ reason: 'search_failed', message: 'Search failed' });
      });

      // Plugin: get_last_event
      // Demonstrates: storage retrieval
      synapse.register('get_last_event', async (ctx) => {
        const lastEvent = await synapse.storage.get('lastEvent');
        
        if (lastEvent) {
          return synapse.success({ lastEvent });
        }
        
        return synapse.fail({ reason: 'not_found', message: 'No previous event found' });
      });

      // Plugin: auth_demo
      // Demonstrates: authentication flow
      synapse.register('auth_demo', async (ctx) => {
        const isAuth = await synapse.auth.isAuthenticated('demo_provider');
        
        if (!isAuth) {
          try {
            await synapse.auth.authenticate('demo_provider');
          } catch (e) {
            return synapse.fail({ reason: 'auth_failed', message: e.message });
          }
        }
        
        return synapse.success({ authenticated: true, provider: 'demo_provider' });
      });

      // Plugin: ui_demo
      // Demonstrates: showing custom UI to user
      synapse.register('ui_demo', async (ctx) => {
        // Show a custom HTML interface
        const result = await synapse.ui.show(`
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: white;
                border-radius: 16px;
                padding: 32px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                max-width: 400px;
                width: 100%;
              }
              h2 { margin-top: 0; color: #333; }
              .options { display: flex; flex-direction: column; gap: 12px; margin: 20px 0; }
              button {
                padding: 14px 24px;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                transition: transform 0.1s;
              }
              button:hover { transform: scale(1.02); }
              .primary { background: #667eea; color: white; }
              .secondary { background: #f0f0f0; color: #333; }
              input, select {
                width: 100%;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 8px;
                font-size: 16px;
                box-sizing: border-box;
                margin-bottom: 12px;
              }
              label { display: block; margin-bottom: 6px; font-weight: 500; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Select Project</h2>
              <p>Choose where to create the task:</p>
              
              <label>Project</label>
              <select id="project">
                <option value="PROJ-1">Engineering</option>
                <option value="PROJ-2">Design</option>
                <option value="PROJ-3">Marketing</option>
              </select>
              
              <label>Priority</label>
              <select id="priority">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              
              <div class="options">
                <button class="primary" onclick="submit()">Create Task</button>
                <button class="secondary" onclick="cancel()">Cancel</button>
              </div>
            </div>
            
            <script>
              function submit() {
                const project = document.getElementById('project').value;
                const priority = document.getElementById('priority').value;
                SynapseBridge.postMessage(JSON.stringify({ 
                  action: 'create',
                  project: project,
                  priority: priority
                }));
              }
              function cancel() {
                SynapseBridge.postMessage(JSON.stringify({ action: 'cancel' }));
              }
            </script>
          </body>
          </html>
        `, { title: 'Select Project' });
        
        if (result && result.action === 'create') {
          // Show a toast to confirm
          await synapse.ui.toast('Task created in ' + result.project + '!');
          return synapse.success({ 
            project: result.project, 
            priority: result.priority,
            message: 'Task created successfully'
          });
        }
        
        return synapse.fail({ reason: 'cancelled', message: 'User cancelled' });
      });
    """;
    
    await _host.loadPlugin(pluginJs, pluginId: 'example_plugin');
    _log('Plugin loaded');

    // ==========================================================================
    // Set up Host Callbacks
    // ==========================================================================
    
    // Status callback
    _host.onStatusChanged = (status, data) {
      _log('Status: $status');
      setState(() {
        _status = status;
        if (status == 'finished' && data['status'] == 'success') {
          _result = 'Success!\n${_prettyJson(data['data'])}';
        } else if (status == 'finished' && data['status'] == 'error') {
          _result = 'Error: ${data['message']}';
        } else {
          _result = data.toString();
        }
      });
    };
    
    // UI Show callback - displays WebView with plugin HTML
    _host.onUiShow = (html, options) async {
      _log('UI Show requested');
      return await showDialog<dynamic>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => PluginUiDialog(
          html: html,
          title: options?['title'] as String? ?? 'Plugin',
        ),
      );
    };
    
    // Toast callback
    _host.onToast = (message, durationMs) {
      _log('Toast: $message');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), duration: Duration(milliseconds: durationMs)),
      );
    };
    
    // Confirm callback
    _host.onConfirm = (message, confirmLabel, cancelLabel) async {
      _log('Confirm dialog: $message');
      final result = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirm'),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(cancelLabel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(confirmLabel ?? 'OK'),
            ),
          ],
        ),
      );
      return result ?? false;
    };
    
    // Auth callbacks (demo implementation)
    _host.onAuthCheck = (provider) async {
      _log('Auth check: $provider');
      // Demo: always return false to trigger auth flow
      return false;
    };
    
    _host.onAuthRequest = (provider) async {
      _log('Auth request: $provider');
      // Demo: simulate auth with a delay and dialog
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Authenticate with $provider'),
          content: const Text('This is a demo. In production, this would open OAuth.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Authenticate'),
            ),
          ],
        ),
      );
      return confirmed ?? false;
    };

    setState(() => _isInit = true);
    _log('Ready!');
  }

  String _prettyJson(dynamic data) {
    try {
      final encoder = const JsonEncoder.withIndent('  ');
      return encoder.convert(data);
    } catch (_) {
      return data.toString();
    }
  }

  void _runCreateEvent() {
    setState(() {
      _status = 'Running...';
      _result = '';
    });
    _log('Dispatching: create_event');

    // Use the new context structure
    _host.dispatch('create_event', {
      'input': {
        'type': 'text',
        'text': 'Meeting with team tomorrow at 10am',
      },
      'llm': {
        'intent': 'create_event',
        'entities': {
          'title': 'Team Meeting',
          'time': 'Tomorrow 10am',
        },
        'confidence': 0.95,
      },
      'user': {
        'locale': 'en-US',
        'timezone': 'America/New_York',
      }
    });
  }

  void _runSearch() {
    setState(() {
      _status = 'Searching...';
      _result = '';
    });
    _log('Dispatching: search');

    _host.dispatch('search', {
      'input': {'type': 'text', 'text': '1'},
      'llm': {
        'intent': 'search',
        'entities': {'query': '1'},
      },
    });
  }

  void _runGetLastEvent() {
    setState(() {
      _status = 'Retrieving...';
      _result = '';
    });
    _log('Dispatching: get_last_event');

    _host.dispatch('get_last_event', {
      'input': {'type': 'text'},
      'llm': {'intent': 'get_last_event', 'entities': {}},
    });
  }

  void _runAuthDemo() {
    setState(() {
      _status = 'Authenticating...';
      _result = '';
    });
    _log('Dispatching: auth_demo');

    _host.dispatch('auth_demo', {
      'input': {'type': 'text'},
      'llm': {'intent': 'auth_demo', 'entities': {}},
    });
  }

  void _runGoogleKeep() {
    setState(() {
      _status = 'Saving to Keep...';
      _result = '';
    });
    _log('Dispatching: save_note');

    _host.dispatch('save_note', {
      'input': {'type': 'text', 'text': 'Buy milk and cookies'},
      'llm': {
        'intent': 'save_note',
        'entities': {
          'title': 'Groceries',
          'body': 'Buy milk and cookies',
        }
      },
    });
  }

  void _runUiDemo() {
    setState(() {
      _status = 'Opening UI...';
      _result = '';
    });
    _log('Dispatching: ui_demo');

    _host.dispatch('ui_demo', {
      'input': {'type': 'text', 'text': 'Create a new task'},
      'llm': {'intent': 'ui_demo', 'entities': {}},
    });
  }

  @override
  void dispose() {
    _host.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Synapse SDK Demo'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Status: $_status', 
                      style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Container(
                      constraints: const BoxConstraints(maxHeight: 150),
                      child: SingleChildScrollView(
                        child: Text(_result.isEmpty ? 'No result yet' : _result,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Action Buttons
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: _isInit ? _runCreateEvent : null,
                  icon: const Icon(Icons.event),
                  label: const Text('Create Event'),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runSearch : null,
                  icon: const Icon(Icons.search),
                  label: const Text('Search'),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runGetLastEvent : null,
                  icon: const Icon(Icons.history),
                  label: const Text('Get Last Event'),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runAuthDemo : null,
                  icon: const Icon(Icons.lock_open),
                  label: const Text('Auth Demo'),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runGoogleKeep : null,
                  icon: const Icon(Icons.note_add),
                  label: const Text('Google Keep'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.amber[700],
                    foregroundColor: Colors.white,
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runUiDemo : null,
                  icon: const Icon(Icons.web),
                  label: const Text('UI Demo'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Logs
            Expanded(
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Logs', style: Theme.of(context).textTheme.titleSmall),
                      const Divider(),
                      Expanded(
                        child: ListView.builder(
                          itemCount: _logs.length,
                          itemBuilder: (ctx, i) => Text(
                            _logs[i],
                            style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Dialog that displays plugin HTML in a WebView.
/// Uses webview_flutter to render custom plugin UI.
class PluginUiDialog extends StatefulWidget {
  final String html;
  final String title;

  const PluginUiDialog({
    super.key,
    required this.html,
    required this.title,
  });

  @override
  State<PluginUiDialog> createState() => _PluginUiDialogState();
}

class _PluginUiDialogState extends State<PluginUiDialog> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'SynapseBridge',
        onMessageReceived: (message) {
          // Parse the message and return it to the dialog
          try {
            final data = jsonDecode(message.message);
            Navigator.of(context).pop(data);
          } catch (e) {
            Navigator.of(context).pop({'raw': message.message});
          }
        },
      )
      ..loadHtmlString(widget.html);
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          width: 500,
          height: 600,
          child: Column(
            children: [
              // Title bar
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                ),
                child: Row(
                  children: [
                    Text(
                      widget.title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(null),
                      iconSize: 20,
                    ),
                  ],
                ),
              ),
              // WebView
              Expanded(
                child: WebViewWidget(controller: _controller),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
