import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_js/flutter_js.dart';
import 'package:http/http.dart' as http;

/// Callback signature for status updates from the plugin system.
typedef SynapseStatusCallback = void Function(String status, dynamic data);

/// Callback signature for UI display requests.
/// Returns the data sent back from the UI, or null if cancelled.
typedef SynapseUiCallback = Future<dynamic> Function(String html, Map<String, dynamic>? options);

/// Callback signature for toast messages.
typedef SynapseToastCallback = void Function(String message, int durationMs);

/// Callback signature for confirmation dialogs.
typedef SynapseConfirmCallback = Future<bool> Function(String message, String? confirmLabel, String? cancelLabel);

/// Callback signature for authentication requests.
typedef SynapseAuthCallback = Future<bool> Function(String provider);

/// The SynapseHost manages the JavaScript runtime and bridges communication
/// between Flutter and JS plugins.
/// 
/// Example usage:
/// ```dart
/// final host = SynapseHost();
/// await host.init();
/// await host.loadSdk(sdkSource);
/// await host.loadPlugin(pluginSource);
/// await host.dispatch('create_event', {
///   'input': {'type': 'text', 'text': 'Meeting at 3pm'},
///   'llm': {'intent': 'create_event', 'entities': {'title': 'Meeting', 'time': '3pm'}}
/// });
/// ```
class SynapseHost {
  late JavascriptRuntime _engine;
  
  /// Storage for plugin data (in production, use flutter_secure_storage)
  final Map<String, Map<String, dynamic>> _storage = {};
  
  /// Current plugin ID (set during dispatch)
  String _currentPluginId = 'default';
  
  // =========================================================================
  // Callbacks
  // =========================================================================
  
  /// Called when a plugin action finishes (success or error).
  SynapseStatusCallback? onStatusChanged;
  
  /// Called when a plugin requests to show custom UI.
  /// The host application should display the HTML in a WebView and return
  /// any data sent back via SynapseBridge.postMessage().
  SynapseUiCallback? onUiShow;
  
  /// Called when a plugin wants to show a toast message.
  SynapseToastCallback? onToast;
  
  /// Called when a plugin requests a confirmation dialog.
  SynapseConfirmCallback? onConfirm;
  
  /// Called to check if authenticated with a provider.
  /// Return true if the user is authenticated.
  Future<bool> Function(String provider)? onAuthCheck;
  
  /// Called to trigger OAuth authentication.
  /// Should complete when auth is done (success) or throw on failure.
  SynapseAuthCallback? onAuthRequest;
  
  /// Called to logout from a provider.
  Future<void> Function(String provider)? onAuthLogout;

  /// Called to get a valid access token for a provider.
  /// Return null if not authenticated or token unavailable.
  Future<String?> Function(String provider)? onAuthGetToken;
  
  /// Called to upload a file. Returns the server response or throws on error.
  Future<Map<String, dynamic>> Function({
    required String fileRef,
    required String url,
    String method,
    Map<String, String>? headers,
    String? fieldName,
    Map<String, String>? formFields,
  })? onUpload;

  // =========================================================================
  // Initialization
  // =========================================================================

  /// Initialize the JavaScript runtime and set up the message bridge.
  Future<void> init() async {
    _engine = getJavascriptRuntime();

    // Set up the message bridge to receive messages from JS
    _engine.onMessage('synapse', (dynamic args) {
      final message = args is String ? jsonDecode(args) : args;
      _handleBridgeMessage(message);
    });
  }

  /// Load the Synapse SDK into the runtime.
  Future<void> loadSdk(String sdkSource) async {
    _engine.evaluate(sdkSource);
  }

  /// Load a plugin script into the runtime.
  Future<void> loadPlugin(String pluginSource, {String pluginId = 'default'}) async {
    _currentPluginId = pluginId;
    _engine.evaluate(pluginSource);
  }

  // =========================================================================
  // Dispatch
  // =========================================================================

  /// Dispatch an intent to the loaded plugin.
  /// 
  /// The [params] should follow the SynapseContext structure:
  /// ```dart
  /// {
  ///   'input': {'type': 'image', 'text': 'OCR text', 'imageRef': 'blob://123'},
  ///   'llm': {'intent': 'create_jira_ticket', 'entities': {...}},
  ///   'user': {'locale': 'en-US'}
  /// }
  /// ```
  Future<void> dispatch(String intent, Map<String, dynamic> params, {String? pluginId}) async {
    if (pluginId != null) {
      _currentPluginId = pluginId;
    }
    
    final paramsJson = jsonEncode(params);
    final code = "synapse._dispatch('$intent', $paramsJson)";
    final result = _engine.evaluate(code);
    
    if (result.isError) {
      debugPrint('[SynapseHost] Dispatch Error: ${result.stringResult}');
    }
  }

  // =========================================================================
  // Bridge Message Handler
  // =========================================================================

  /// Handle messages coming from JavaScript.
  void _handleBridgeMessage(Map<String, dynamic> message) async {
    final type = message['type'] as String?;
    final id = message['id'] as String?;
    final payload = message['payload'] as Map<String, dynamic>? ?? {};

    debugPrint('[SynapseHost] Received: $type');

    switch (type) {
      // Network
      case 'fetch':
        await _handleFetch(id, payload);
        break;
        
      // Legacy network (backwards compatibility)
      case 'network_request':
        await _handleFetch(id, payload);
        break;

      // UI
      case 'ui_show':
        await _handleUiShow(id, payload);
        break;
        
      case 'ui_toast':
        _handleToast(payload);
        break;
        
      case 'ui_confirm':
        await _handleConfirm(id, payload);
        break;

      // Auth
      case 'auth_check':
        await _handleAuthCheck(id, payload);
        break;
        
      case 'auth_authenticate':
        await _handleAuthRequest(id, payload);
        break;
        
      case 'auth_logout':
        await _handleAuthLogout(id, payload);
        break;

      // Storage
      case 'storage_get':
        await _handleStorageGet(id, payload);
        break;
        
      case 'storage_set':
        _handleStorageSet(payload);
        break;
        
      case 'storage_delete':
        _handleStorageDelete(payload);
        break;
        
      case 'storage_clear':
        _handleStorageClear();
        break;

      // Upload
      case 'upload':
        await _handleUpload(id, payload);
        break;

      // Status
      case 'finished':
        debugPrint('[SynapseHost] Action Finished: $payload');
        onStatusChanged?.call('finished', payload);
        break;
        
      case 'log':
        debugPrint('[JS] ${payload['message']}');
        break;
        
      default:
        debugPrint('[SynapseHost] Unknown message type: $type');
    }
  }

  // =========================================================================
  // Network Handler
  // =========================================================================

  /// Handle fetch requests from the plugin.
  /// Returns a response matching SynapseResponseData.
  Future<void> _handleFetch(String? id, Map<String, dynamic> req) async {
    if (id == null) return;

    try {
      final url = Uri.parse(req['url'] as String);
      final method = (req['method'] as String?) ?? 'GET';
      final headers = Map<String, String>.from(req['headers'] ?? {});
      final body = req['body'];
      final provider = req['provider'] as String?;

      debugPrint('[SynapseHost] Fetch: $method $url');

      if (provider != null && provider.isNotEmpty) {
        bool isAuth = true;
        if (onAuthCheck != null) {
          isAuth = await onAuthCheck!(provider);
        }
        if (!isAuth && onAuthRequest != null) {
          await onAuthRequest!(provider);
        }

        if (onAuthGetToken == null) {
          _resolvePromise(id, null, error: 'Auth token provider not configured');
          return;
        }

        final token = await onAuthGetToken!(provider);
        if (token == null || token.isEmpty) {
          _resolvePromise(id, null, error: 'Failed to obtain access token');
          return;
        }

        headers.putIfAbsent('Authorization', () => 'Bearer $token');
      }

      Future<http.Response> doRequest() async {
        switch (method.toUpperCase()) {
          case 'POST':
            return http.post(url, headers: headers, body: body);
          case 'PUT':
            return http.put(url, headers: headers, body: body);
          case 'DELETE':
            return http.delete(url, headers: headers);
          case 'PATCH':
            return http.patch(url, headers: headers, body: body);
          default:
            return http.get(url, headers: headers);
        }
      }

      http.Response response = await doRequest();

      // Retry once on 401 for provider-auth requests
      if (response.statusCode == 401 && provider != null && provider.isNotEmpty) {
        if (onAuthRequest != null && onAuthGetToken != null) {
          await onAuthRequest!(provider);
          final token = await onAuthGetToken!(provider);
          if (token != null && token.isNotEmpty) {
            headers['Authorization'] = 'Bearer $token';
            response = await doRequest();
          }
        }
      }

      // Build response matching SynapseResponseData interface
      final statusText = _getStatusText(response.statusCode);
      final bridgeResponse = {
        'status': response.statusCode,
        'ok': response.statusCode >= 200 && response.statusCode < 300,
        'statusText': statusText,
        'headers': response.headers,
        'body': response.body,
      };

      _resolvePromise(id, bridgeResponse);

    } catch (e) {
      debugPrint('[SynapseHost] Fetch Error: $e');
      _resolvePromise(id, null, error: e.toString());
    }
  }

  /// Get HTTP status text from code.
  String _getStatusText(int code) {
    const statusTexts = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
    };
    return statusTexts[code] ?? 'Unknown';
  }

  // =========================================================================
  // UI Handlers
  // =========================================================================

  Future<void> _handleUiShow(String? id, Map<String, dynamic> payload) async {
    if (id == null) return;
    
    if (onUiShow == null) {
      _resolvePromise(id, null, error: 'UI display not implemented');
      return;
    }
    
    try {
      final html = payload['html'] as String?;
      final options = payload['options'] as Map<String, dynamic>?;
      
      if (html == null) {
        _resolvePromise(id, null, error: 'No HTML content provided');
        return;
      }
      
      final result = await onUiShow!(html, options);
      _resolvePromise(id, result);
    } catch (e) {
      _resolvePromise(id, null, error: e.toString());
    }
  }

  void _handleToast(Map<String, dynamic> payload) {
    final message = payload['message'] as String? ?? '';
    final duration = payload['duration'] as int? ?? 3000;
    onToast?.call(message, duration);
  }

  Future<void> _handleConfirm(String? id, Map<String, dynamic> payload) async {
    if (id == null) return;
    
    if (onConfirm == null) {
      // Default: return true
      _resolvePromise(id, true);
      return;
    }
    
    try {
      final message = payload['message'] as String? ?? '';
      final confirmLabel = payload['confirmLabel'] as String?;
      final cancelLabel = payload['cancelLabel'] as String?;
      
      final result = await onConfirm!(message, confirmLabel, cancelLabel);
      _resolvePromise(id, result);
    } catch (e) {
      _resolvePromise(id, false);
    }
  }

  // =========================================================================
  // Auth Handlers
  // =========================================================================

  Future<void> _handleAuthCheck(String? id, Map<String, dynamic> payload) async {
    if (id == null) return;
    
    final provider = payload['provider'] as String? ?? '';
    
    if (onAuthCheck == null) {
      _resolvePromise(id, false);
      return;
    }
    
    try {
      final isAuth = await onAuthCheck!(provider);
      _resolvePromise(id, isAuth);
    } catch (e) {
      _resolvePromise(id, false);
    }
  }

  Future<void> _handleAuthRequest(String? id, Map<String, dynamic> payload) async {
    if (id == null) return;
    
    final provider = payload['provider'] as String? ?? '';
    
    if (onAuthRequest == null) {
      _resolvePromise(id, null, error: 'Authentication not implemented');
      return;
    }
    
    try {
      final success = await onAuthRequest!(provider);
      if (success) {
        _resolvePromise(id, null);
      } else {
        _resolvePromise(id, null, error: 'Authentication failed');
      }
    } catch (e) {
      _resolvePromise(id, null, error: e.toString());
    }
  }

  Future<void> _handleAuthLogout(String? id, Map<String, dynamic> payload) async {
    final provider = payload['provider'] as String? ?? '';
    
    try {
      await onAuthLogout?.call(provider);
      if (id != null) {
        _resolvePromise(id, null);
      }
    } catch (e) {
      if (id != null) {
        _resolvePromise(id, null, error: e.toString());
      }
    }
  }

  // =========================================================================
  // Storage Handlers
  // =========================================================================

  Future<void> _handleStorageGet(String? id, Map<String, dynamic> payload) async {
    if (id == null) return;
    
    final key = payload['key'] as String? ?? '';
    final pluginStorage = _storage[_currentPluginId] ?? {};
    final value = pluginStorage[key];
    
    _resolvePromise(id, value);
  }

  void _handleStorageSet(Map<String, dynamic> payload) {
    final key = payload['key'] as String? ?? '';
    final value = payload['value'];
    
    _storage.putIfAbsent(_currentPluginId, () => {});
    _storage[_currentPluginId]![key] = value;
  }

  void _handleStorageDelete(Map<String, dynamic> payload) {
    final key = payload['key'] as String? ?? '';
    _storage[_currentPluginId]?.remove(key);
  }

  void _handleStorageClear() {
    _storage[_currentPluginId]?.clear();
  }

  // =========================================================================
  // Upload Handler
  // =========================================================================

  Future<void> _handleUpload(String? id, Map<String, dynamic> payload) async {
    if (id == null) return;
    
    if (onUpload == null) {
      _resolvePromise(id, {'success': false, 'error': 'Upload not implemented'});
      return;
    }
    
    try {
      final result = await onUpload!(
        fileRef: payload['fileRef'] as String? ?? '',
        url: payload['url'] as String? ?? '',
        method: payload['method'] as String? ?? 'POST',
        headers: Map<String, String>.from(payload['headers'] ?? {}),
        fieldName: payload['fieldName'] as String?,
        formFields: Map<String, String>.from(payload['formFields'] ?? {}),
      );
      
      _resolvePromise(id, {
        'success': true,
        'response': result,
      });
    } catch (e) {
      _resolvePromise(id, {
        'success': false,
        'error': e.toString(),
      });
    }
  }

  // =========================================================================
  // Promise Resolution
  // =========================================================================

  /// Resolve a pending promise in JavaScript.
  void _resolvePromise(String id, dynamic data, {String? error}) {
    final dataJson = jsonEncode(data);
    final errorArg = error != null ? jsonEncode(error) : 'null';
    
    final code = "synapse._bridge.resolve('$id', $dataJson, $errorArg)";
    _engine.evaluate(code);
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /// Dispose of the JavaScript runtime.
  void dispose() {
    _engine.dispose();
  }
}
