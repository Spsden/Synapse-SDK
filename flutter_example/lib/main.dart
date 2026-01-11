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
      title: 'Synapse Test',
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

  @override
  void initState() {
    super.initState();
    _initSynapse();
  }

  Future<void> _initSynapse() async {
    await _host.init();

    // Load SDK
    final sdkJs = await rootBundle.loadString('assets/synapse.global.js');
    await _host.loadSdk(sdkJs);

    // Register a COMPLEX plugin (jsonplaceholder)
    const pluginJs = """
      synapse.register('create_event', async (params) => {
        
        // 1. Input Validation
        if (!params.title) throw new Error("Title is required");

        // 2. Perform Network Request (Proxied via Flutter)
        // We will simulate creating a 'comment' on jsonplaceholder
        const response = await synapse.net.post('https://jsonplaceholder.typicode.com/comments', {
          name: params.title,
          email: 'user@synapse.com',
          body: params.time,
          postId: 1,
        });

        // 3. Logic based on response
        if (response.status === 201) {
          return synapse.success({
            id: response.data.email,
            message: "Event Synced!",
            server_response: response.data
          });
        } else {
          throw new Error("Server rejected request: " + response.status);
        }
      });

      synapse.register('google_calendar', async (params) => {
         // 1. Validate
         if (!params.summary) throw new Error("Summary missing");

         // 2. Mock API Call to Google
         // In a real app, you would pass an Auth Token in headers
         const response = await synapse.net.post('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
           summary: params.summary,
           start: { dateTime: params.startTime },
           end: { dateTime: params.endTime }
         });
         
         // 3. Handle Mock Response (Simulated Failure for demo if unauthorized)
         // Since we don't have a token, this will fail 401. 
         // But for the example, let's catch it or just let it fail to show error handling.
         
         if (response.status === 200) {
            return synapse.success({ link: response.data.htmlLink });
         } else {
            // For Demo purposes, if it's 401/403 (expected), we return a mock success
             return synapse.success({ 
               mock: true, 
               message: "Simulated Success (Auth missing)",
               link: "https://calendar.google.com" 
             });
         }
      });
    """;
    await _host.loadPlugin(pluginJs);

    _host.onStatusChanged = (status, data) {
      setState(() {
        _status = status;
        // Pretty print the JSON result
        if (status == 'finished' && data['status'] == 'success') {
           _result = "Success! ID: " + data['data'].toString();
        } else {
           _result = data.toString();
        }
      });
    };

    setState(() => _isInit = true);
  }

  void _runTest() {
    setState(() {
      _status = 'Running...';
      _result = '';
    });

    _host.dispatch('create_event', {
      'title': 'Sync with Gemini',
      'time': 'Tomorrow 10am'
    });
  }

  void _runGoogleCalendar() {
    setState(() {
      _status = 'Running GCal...';
      _result = '';
    });

    _host.dispatch('google_calendar', {
      'summary': 'Team Meeting',
      'startTime': '2025-12-12T10:00:00Z',
      'endTime': '2025-12-12T11:00:00Z'
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
      appBar: AppBar(title: const Text('Synapse SDK Test')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Status: $_status', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 20),
              Text('Result: $_result'),
              const SizedBox(height: 40),
              ElevatedButton(
                onPressed: _isInit ? _runTest : null,
                child: const Text('Run create_event Intent'),
              ),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: _isInit ? _runGoogleCalendar : null,
                style: ElevatedButton.styleFrom(backgroundColor: Colors.blueGrey),
                child: const Text('Run Google Calendar Intent'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
