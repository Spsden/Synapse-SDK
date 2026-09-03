import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  // Mock Authentication State
  final Set<String> _authenticatedProviders = {};

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

    // ==========================================================================
    // Load GOOGLE MOCK Plugin (Embedded for Test)
    // ==========================================================================
    const googleMockJs = """
      synapse.register('list_notes', async (ctx) => {
        synapse.log('google_mock: list_notes triggered');
        
        const isAuth = await synapse.auth.isAuthenticated('google');
        
        if (!isAuth) {
          synapse.log('google_mock: Not authenticated, requesting login...');
          try {
            await synapse.auth.authenticate('google');
            synapse.log('google_mock: Authentication successful');
          } catch (e) {
            return synapse.fail({ reason: 'auth_failed', message: 'User declined login' });
          }
        }

        synapse.log('google_mock: Fetching notes...');
        // Simulate network delay
        await new Promise(r => setTimeout(r, 500));

        return synapse.success({
          notes: [
            { id: '1', title: 'Groceries', body: 'Milk, Eggs, Bread' },
            { id: '2', title: 'Ideas', body: 'Build a robot that answers emails' },
            { id: '3', title: 'To Do', body: 'Finish Synapse SDK' }
          ]
        });
      });

      synapse.register('logout', async (ctx) => {
        await synapse.auth.logout('google');
        return synapse.success({ message: 'Logged out of Mock Google' });
      });
    """;

    await _host.loadPlugin(googleMockJs, pluginId: 'com.synapse.google.mock');
    _log('Google Mock Plugin loaded');

    // Load PROMPT DEMO Plugin (demonstrates synapse.prompt in a chat run)
    const promptDemoJs = """
      synapse.register('ask_favorite', async (ctx) => {
        synapse.log('prompt demo: surface=' + (ctx.execution ? ctx.execution.surface : 'unknown'));
        const result = await synapse.prompt({
          message: 'What should I call your new playlist?',
          fields: [
            { name: 'name', type: 'text', label: 'Playlist name', placeholder: 'Road Trip', required: true },
            { name: 'mood', type: 'select', label: 'Mood', options: [
              { value: 'chill', label: 'Chill' },
              { value: 'energetic', label: 'Energetic' }
            ] }
          ]
        });
        if (result.cancelled || !result.values) {
          return synapse.fail({ reason: 'cancelled', message: 'User dismissed the question' });
        }
        return synapse.success({
          message: 'Created "' + result.values.name + '" (' + result.values.mood + ')'
        });
      });
    """;
    await _host.loadPlugin(promptDemoJs, pluginId: 'com.synapse.prompt.demo');
    _log('Prompt Demo Plugin loaded');

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
        } else if (status == 'finished' && data['status'] == 'fail') {
          _result = 'Error: ${data['error']}';
        } else {
          _result = data.toString();
        }
      });
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

    // Prompt callback (synapse.prompt — structured question)
    _host.onPrompt = (spec) async {
      final message = spec['message'] as String? ?? 'Plugin question';
      _log('Prompt requested: $message');
      return await showDialog<Map<String, String>>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => PromptDialog(message: message, spec: spec),
      );
    };
    
    // Auth callbacks (Stateful Mock)
    _host.onAuthCheck = (provider) async {
      _log('Auth check: $provider');
      return _authenticatedProviders.contains(provider);
    };
    
    _host.onAuthRequest = (provider) async {
      _log('Auth request: $provider');
      
      final usernameController = TextEditingController();
      final passwordController = TextEditingController();
      
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Authenticate with $provider'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
               const Icon(Icons.security, size: 48, color: Colors.blue),
               const SizedBox(height: 16),
               Text('Plugin is requesting access to your $provider account.'),
               const SizedBox(height: 8),
               TextField(
                 controller: usernameController,
                 decoration: const InputDecoration(labelText: 'Username (Mock)', hintText: 'Any value'),
               ),
               TextField(
                 controller: passwordController,
                 decoration: const InputDecoration(labelText: 'Password (Mock)', hintText: 'Any value'),
                 obscureText: true,
               ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (usernameController.text.isNotEmpty && passwordController.text.isNotEmpty) {
                  Navigator.of(ctx).pop(true);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please enter mock credentials')),
                  );
                }
              },
              child: const Text('Login'),
            ),
          ],
        ),
      );
      
      // Clean up controllers
      usernameController.dispose();
      passwordController.dispose();
      
      if (confirmed == true) {
        setState(() {
          _authenticatedProviders.add(provider);
        });
        _log('Auth Success: $provider');
        return true;
      } else {
        _log('Auth Cancelled: $provider');
        return false;
      }
    };

    _host.onAuthLogout = (provider) async {
       _log('Logout: \$provider');
       setState(() {
         _authenticatedProviders.remove(provider);
       });
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

  void _runGoogleMockList() {
    setState(() {
      _status = 'Listing Notes...';
      _result = '';
    });
    _log('Dispatching: list_notes');

    _host.dispatch('list_notes', {
      'input': {'type': 'text'},
      'llm': {'intent': 'list_notes', 'entities': {}},
    });
  }

  void _runGoogleMockLogout() {
    setState(() {
      _status = 'Logging out...';
      _result = '';
    });
    _log('Dispatching: logout');

    _host.dispatch('logout', {
      'input': {'type': 'text'},
      'llm': {'intent': 'logout', 'entities': {}},
    });
  }

  void _runPromptDemo() {
    setState(() {
      _status = 'Asking (chat surface)...';
      _result = '';
    });
    _log('Dispatching: ask_favorite (execution.surface=chat)');

    _host.dispatch('ask_favorite', {
      'input': {'type': 'text'},
      'llm': {'intent': 'ask_favorite', 'entities': {}},
      'execution': {'surface': 'chat'},
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
        title: const Text('Synapse SDK Verification'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _initSynapse,
          )
        ],
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
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Status: \$_status', 
                          style: Theme.of(context).textTheme.titleMedium),
                        if (_authenticatedProviders.contains('google'))
                          const Chip(
                            avatar: Icon(Icons.check_circle, color: Colors.green, size: 18),
                            label: Text('Google Auth'),
                            visualDensity: VisualDensity.compact,
                          )
                      ],
                    ),
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
            const Text('Test Plugins', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  onPressed: _isInit ? _runGoogleMockList : null,
                  icon: const Icon(Icons.list),
                  label: const Text('List Notes'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue[700],
                    foregroundColor: Colors.white,
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runGoogleMockLogout : null,
                  icon: const Icon(Icons.logout),
                  label: const Text('Logout'),
                  style: ElevatedButton.styleFrom(
                    foregroundColor: Colors.red,
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _isInit ? _runPromptDemo : null,
                  icon: const Icon(Icons.help_outline),
                  label: const Text('Ask (Prompt)'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            const Divider(),
            
            // Logs
            Expanded(
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Logs', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
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

/// Renders a `synapse.prompt()` spec as a dialog: text fields become
/// [TextField]s, select fields become [DropdownButton]s. Pops with the
/// values map on submit, or null on cancel.
class PromptDialog extends StatefulWidget {
  final String message;
  final Map<String, dynamic> spec;

  const PromptDialog({super.key, required this.message, required this.spec});

  @override
  State<PromptDialog> createState() => _PromptDialogState();
}

class _PromptDialogState extends State<PromptDialog> {
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, String?> _selections = {};

  @override
  void initState() {
    super.initState();
    for (final field in _fields) {
      final name = field['name'] as String? ?? '';
      if ((field['type'] as String?) == 'select') {
        final options = (field['options'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .toList();
        _selections[name] =
            options.isNotEmpty ? options.first['value'] as String? : null;
      } else {
        _controllers[name] =
            TextEditingController(text: field['defaultValue'] as String? ?? '');
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  List<Map<String, dynamic>> get _fields =>
      (widget.spec['fields'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();

  void _submit() {
    for (final field in _fields) {
      if (field['required'] == true) {
        final name = field['name'] as String? ?? '';
        final isSelect = (field['type'] as String?) == 'select';
        final value = isSelect ? _selections[name] : _controllers[name]?.text;
        if (value == null || value.trim().isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('"${field['label'] ?? name}" is required')),
          );
          return;
        }
      }
    }

    final values = <String, String>{
      for (final entry in _controllers.entries) entry.key: entry.value.text,
      for (final entry in _selections.entries)
        if (entry.value != null) entry.key: entry.value!,
    };
    Navigator.of(context).pop(values);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Plugin question'),
      content: SizedBox(
        width: 380,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.message),
            const SizedBox(height: 16),
            for (final field in _fields) ...[
              if ((field['type'] as String?) == 'select')
                DropdownButtonFormField<String>(
                  initialValue: _selections[field['name'] as String? ?? ''],
                  decoration: InputDecoration(
                    labelText: field['label'] as String?,
                    border: const OutlineInputBorder(),
                  ),
                  items: [
                    for (final option in field['options'] as List<dynamic>? ?? [])
                      if (option is Map<String, dynamic>)
                        DropdownMenuItem(
                          value: option['value'] as String?,
                          child: Text(option['label'] as String? ??
                              option['value'].toString()),
                        ),
                  ],
                  onChanged: (value) =>
                      setState(() => _selections[field['name'] as String? ?? ''] = value),
                )
              else
                TextField(
                  controller: _controllers[field['name'] as String? ?? ''],
                  decoration: InputDecoration(
                    labelText: field['label'] as String?,
                    hintText: field['placeholder'] as String?,
                    border: const OutlineInputBorder(),
                  ),
                ),
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(null),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Submit'),
        ),
      ],
    );
  }
}
