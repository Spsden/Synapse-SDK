import 'dart:convert';
import 'package:flutter_js/flutter_js.dart';
import 'package:http/http.dart' as http;

class SynapseHost {
  late JavascriptRuntime _engine;
  
  // Callback for UI updates
  Function(String status, dynamic data)? onStatusChanged;

  Future<void> init() async {
    _engine = getJavascriptRuntime();

    // 1. Setup the Message Bridge
    // Use the 'synapse' channel to receive messages from JS
    _engine.onMessage('synapse', (dynamic args) {
      // flutter_js might pass args as String or Map depending on implementation
      // We assume it handles JSON stringification if coming from sendMessage
      final message = args is String ? jsonDecode(args) : args;
      _handleBridgeMessage(message);
    });
  }

  Future<void> loadSdk(String sdkSource) async {
    _engine.evaluate(sdkSource);
  }

  Future<void> loadPlugin(String pluginSource) async {
    _engine.evaluate(pluginSource);
  }

  /// Dispatch an intent to the JS Runtime
  Future<void> dispatch(String intent, Map<String, dynamic> params) async {
    final paramsJson = jsonEncode(params);
    // Call the internal dispatch method of the SDK
    final code = "synapse._dispatch('$intent', $paramsJson)";
    final result = _engine.evaluate(code);
    
    // Check if immediate error occurred
    if (result.isError) {
      print('[SynapseHost] Dispatch Error: ${result.stringResult}');
    }
  }

  /// Handle messages coming FROM Javascript
  void _handleBridgeMessage(Map<String, dynamic> message) async {
    final type = message['type'];
    final id = message['id']; // Correlation ID for async responses
    final payload = message['payload'];

    print('[SynapseHost] Received: $type');

    switch (type) {
      case 'network_request':
        // JS is waiting for this response
        await _handleNetworkRequest(id, payload);
        break;

      case 'finished':
        // The flow is complete (Success or Failure)
        print('[SynapseHost] Action Finished: $payload');
        if (onStatusChanged != null) {
          onStatusChanged!('finished', payload);
        }
        break;
        
      case 'log':
        print('[JS Log] ${payload['message']}');
        break;
    }
  }

  /// Execute the network request on behalf of the Plugin
  Future<void> _handleNetworkRequest(String? id, Map<String, dynamic> req) async {
    if (id == null) return; // Fire and forget if no ID (shouldn't happen for net)

    try {
      final url = Uri.parse(req['url']);
      final method = req['method'] ?? 'GET';
      final headers = Map<String, String>.from(req['headers'] ?? {});
      final body = req['body'];

      http.Response response;
      
      print('[SynapseHost] Performing HTTP $method to $url');

      if (method == 'POST') {
        response = await http.post(
          url, 
          headers: headers, 
          body: body is String ? body : jsonEncode(body)
        );
      } else {
        response = await http.get(url, headers: headers);
      }

      // Prepare response for JS
      // We assume the body is JSON, but should handle text too
      dynamic responseData;
      try {
        responseData = jsonDecode(response.body);
      } catch (_) {
        responseData = response.body;
      }

      final bridgeResponse = {
        'status': response.statusCode,
        'data': responseData,
        'headers': response.headers
      };

      _resolvePromise(id, bridgeResponse);

    } catch (e) {
      print('[SynapseHost] Network Error: $e');
      _resolvePromise(id, null, error: e.toString());
    }
  }

  /// Call synapse._bridge.resolve() in JS to unblock the plugin
  void _resolvePromise(String id, dynamic data, {String? error}) {
    final dataJson = jsonEncode(data);
    // Escape error string just in case
    final errorArg = error != null ? jsonEncode(error) : "null";
    
    // Resume JS execution
    final code = "synapse._bridge.resolve('$id', $dataJson, $errorArg)";
    _engine.evaluate(code);
  }

  void dispose() {
    _engine.dispose();
  }
}
