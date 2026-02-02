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
    
    // UI Show callback
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
            const Text('Google Mock Plugin', style: TextStyle(fontWeight: FontWeight.bold)),
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
