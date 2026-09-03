import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:fjs/fjs.dart';
import 'package:http/http.dart' as http;

/// Callback signature for status updates from the plugin system.
typedef SynapseStatusCallback = void Function(String status, dynamic data);

/// Callback signature for toast messages.
typedef SynapseToastCallback = void Function(String message, int durationMs);

/// Callback signature for confirmation dialogs.
typedef SynapseConfirmCallback = Future<bool> Function(
    String message, String? confirmLabel, String? cancelLabel);

/// Callback signature for authentication requests.
typedef SynapseAuthCallback = Future<bool> Function(String provider);

/// Callback signature for plugin questions (synapse.prompt()).
/// [spec] contains `message` and `fields` (name/type/label/options).
/// Returns a map of field name → answer, or null if the user cancelled.
typedef SynapsePromptCallback = Future<Map<String, String>?> Function(
    Map<String, dynamic> spec);

/// Reference host for the fjs-native bridge protocol (SDK transport v2).
///
/// The SDK captures `fjs.bridge_call` while it loads and removes the global;
/// requests arrive here as one structured envelope `{v, type, payload}` and
/// the returned [JsResult] resolves the calling promise directly. There is no
/// request-id map and no `synapse._bridge.resolve` evaluation on this path.
///
/// Usage:
/// ```dart
/// final host = SynapseHost();
/// await host.init();
/// await host.loadSdk(sdkSource);
/// await host.loadPlugin(pluginSource);
/// final result = await host.dispatch('create_event', {
///   'input': {'type': 'text', 'text': 'Meeting at 3pm'},
///   'llm': {'intent': 'create_event', 'entities': {'title': 'Meeting', 'time': '3pm'}}
/// });
/// ```
class SynapseHost {
  late JsEngine _engine;
  bool _disposed = false;

  /// Storage for plugin data (in production, use flutter_secure_storage)
  final Map<String, Map<String, dynamic>> _storage = {};

  /// Current plugin ID (set during dispatch)
  String _currentPluginId = 'default';

  // =========================================================================
  // Callbacks
  // =========================================================================

  /// Called when a plugin action finishes (success or error).
  SynapseStatusCallback? onStatusChanged;

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

  /// Called to upload a file. Returns the server response or throws on error.
  Future<Map<String, dynamic>> Function({
    required String fileRef,
    required String url,
    String method,
    Map<String, String>? headers,
    String? fieldName,
    Map<String, String>? formFields,
  })? onUpload;

  /// Called when a plugin asks the user a structured question.
  /// Render the message + fields on the active surface (chat message,
  /// dialog, or generated form) and return the answers, or null on cancel.
  SynapsePromptCallback? onPrompt;

  // =========================================================================
  // Initialization
  // =========================================================================

  /// Whether the FJS native library has been loaded for this process.
  static bool _fjsInitialized = false;

  /// Initialize the JavaScript runtime and set up the bridge.
  Future<void> init() async {
    if (!_fjsInitialized) {
      await LibFjs.init();
      _fjsInitialized = true;
    }

    // The bundled demo plugins use setTimeout, so timers are enabled. Fetch
    // stays off: network requests must route through the host bridge.
    _engine = await JsEngine.create(
      builtins: const JsBuiltinOptions(console: true, timers: true),
      runtimeOptions: JsEngineRuntimeOptions(
        memoryLimit: BigInt.from(64 << 20),
        maxStackSize: BigInt.from(512 << 10),
        info: 'synapse-example-host',
      ),
    );
    await _engine.init(bridge: _onBridgeCall);
  }

  /// Load the Synapse SDK into the runtime.
  Future<void> loadSdk(String sdkSource) async {
    await _engine.eval(source: JsCode.code(sdkSource));
    // The SDK must have claimed fjs.bridge_call and removed the global. A
    // stale SDK build would leave the raw bridge reachable by plugin code.
    final exposed = await _engine.eval(
      source: const JsCode.code(
        "typeof globalThis.fjs !== 'undefined' || "
        "typeof globalThis.sendMessage !== 'undefined'",
      ),
    );
    if (exposed.value == true) {
      throw StateError(
        'The SDK bundle did not claim the fjs bridge; rebuild it from the '
        'current Synapse-SDK sources.',
      );
    }
  }

  /// Load a plugin script into the runtime.
  Future<void> loadPlugin(String pluginSource,
      {String pluginId = 'default'}) async {
    _currentPluginId = pluginId;
    await _engine.eval(source: JsCode.code(pluginSource));
  }

  // =========================================================================
  // Dispatch
  // =========================================================================

  /// Dispatch an intent to the loaded plugin and resolve with its result.
  ///
  /// The [params] should follow the SynapseContext structure:
  /// ```dart
  /// {
  ///   'input': {'type': 'image', 'text': 'OCR text', 'imageRef': 'blob://123'},
  ///   'llm': {'intent': 'create_jira_ticket', 'entities': {...}},
  ///   'user': {'locale': 'en-US'}
  /// }
  /// ```
  Future<Map<String, dynamic>?> dispatch(
    String intent,
    Map<String, dynamic> params, {
    String? pluginId,
  }) async {
    if (pluginId != null) {
      _currentPluginId = pluginId;
    }

    final dispatchParams = Map<String, dynamic>.from(params);
    final execution = Map<String, dynamic>.from(
      dispatchParams['execution'] as Map? ?? const {},
    );
    final capabilities = Map<String, dynamic>.from(
      execution['capabilities'] as Map? ?? const {},
    );
    capabilities['prompt'] = onPrompt != null;
    execution['capabilities'] = capabilities;
    dispatchParams['execution'] = execution;

    final code =
        'synapse._dispatch(${jsonEncode(intent)}, ${jsonEncode(dispatchParams)})';
    try {
      final value = await _engine.eval(
        source: JsCode.code(code),
        options: JsEvalOptions.withPromise(),
      );
      final raw = value.value;
      final result =
          raw is Map ? Map<String, dynamic>.from(raw) : null;
      if (result != null) {
        onStatusChanged?.call('finished', result);
      }
      return result;
    } on JsError catch (error) {
      debugPrint('[SynapseHost] Dispatch Error: $error');
      return null;
    }
  }

  // =========================================================================
  // Bridge Entry Point
  // =========================================================================

  /// Receives the SDK's `{v, type, payload}` envelope and returns the reply
  /// that resolves the calling promise. Failures are returned as
  /// `{__synapseError: {code, message}}` so stable codes survive the
  /// transport and the SDK rethrows them as `BridgeError`.
  Future<JsResult> _onBridgeCall(JsValue value) async {
    final raw = value.value;
    final envelope =
        raw is Map ? Map<String, dynamic>.from(raw) : null;
    if (envelope == null || envelope['v'] != 2) {
      return const JsResult.err(JsError.bridge('Malformed bridge envelope.'));
    }
    final type = envelope['type'] as String?;
    if (type == null || type.isEmpty) {
      return const JsResult.err(
          JsError.bridge('Bridge envelope is missing a type.'));
    }
    final payload = (envelope['payload'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};

    debugPrint('[SynapseHost] Received: $type');
    try {
      final reply = await _handleBridgeMessage(type, payload);
      return JsResult.ok(
        reply == null ? const JsValue.none() : JsValue.from(reply),
      );
    } on _BridgeReject catch (reject) {
      return JsResult.ok(JsValue.from({
        '__synapseError': {'code': reject.code, 'message': reject.message},
      }));
    } catch (error) {
      debugPrint('[SynapseHost] Bridge Error: $error');
      return JsResult.ok(JsValue.from({
        '__synapseError': {
          'code': 'EXECUTION_ERROR',
          'message': '$error',
        },
      }));
    }
  }

  // =========================================================================
  // Bridge Message Handler
  // =========================================================================

  /// Routes one request to its handler. Notifications return null; failures
  /// throw [_BridgeReject] so the SDK sees a structured rejection.
  Future<dynamic> _handleBridgeMessage(
      String type, Map<String, dynamic> payload) async {
    switch (type) {
      // Network
      case 'fetch':
        return _handleFetch(payload);

      // UI
      case 'ui_toast':
        _handleToast(payload);
        return null;

      case 'ui_confirm':
        return _handleConfirm(payload);

      // Prompt (surface-agnostic question)
      case 'prompt':
        return _handlePrompt(payload);

      case 'auth_check':
        return _handleAuthCheck(payload);

      case 'auth_authenticate':
        return _handleAuthRequest(payload);

      case 'auth_logout':
        await onAuthLogout?.call(payload['provider'] as String? ?? '');
        return null;

      // Storage
      case 'storage_get':
        return _storage[_currentPluginId]?[payload['key'] as String? ?? ''];

      case 'storage_set':
        _storage
            .putIfAbsent(_currentPluginId, () => {})[payload['key'] as String? ?? ''] =
            payload['value'];
        return null;

      case 'storage_delete':
        _storage[_currentPluginId]
            ?.remove(payload['key'] as String? ?? '');
        return null;

      case 'storage_clear':
        _storage[_currentPluginId]?.clear();
        return null;

      // Upload
      case 'upload':
        return _handleUpload(payload);

      // Status
      case 'log':
        debugPrint('[JS] ${payload['message']}');
        return null;

      default:
        debugPrint('[SynapseHost] Unknown message type: $type');
        throw const _BridgeReject(
            'INVALID_REQUEST', 'Unsupported bridge operation.');
    }
  }

  // =========================================================================
  // Network Handler
  // =========================================================================

  /// Handle fetch requests from the plugin.
  /// Returns a response matching SynapseResponseData.
  Future<Map<String, dynamic>> _handleFetch(
      Map<String, dynamic> req) async {
    try {
      final url = Uri.parse(req['url'] as String);
      final method = (req['method'] as String?) ?? 'GET';
      final headers = Map<String, String>.from(req['headers'] ?? {});
      final body = req['body'];

      debugPrint('[SynapseHost] Fetch: $method $url');

      http.Response response;

      switch (method.toUpperCase()) {
        case 'POST':
          response = await http.post(url, headers: headers, body: body);
          break;
        case 'PUT':
          response = await http.put(url, headers: headers, body: body);
          break;
        case 'DELETE':
          response = await http.delete(url, headers: headers);
          break;
        case 'PATCH':
          response = await http.patch(url, headers: headers, body: body);
          break;
        default:
          response = await http.get(url, headers: headers);
      }

      return {
        'status': response.statusCode,
        'ok': response.statusCode >= 200 && response.statusCode < 300,
        'statusText': _getStatusText(response.statusCode),
        'headers': response.headers,
        'body': response.body,
      };
    } catch (e) {
      debugPrint('[SynapseHost] Fetch Error: $e');
      throw _BridgeReject('HOST_ERROR', e.toString());
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

  void _handleToast(Map<String, dynamic> payload) {
    final message = payload['message'] as String? ?? '';
    final duration = payload['duration'] as int? ?? 3000;
    onToast?.call(message, duration);
  }

  Future<bool> _handleConfirm(Map<String, dynamic> payload) async {
    if (onConfirm == null) {
      return true;
    }

    try {
      final message = payload['message'] as String? ?? '';
      final confirmLabel = payload['confirmLabel'] as String?;
      final cancelLabel = payload['cancelLabel'] as String?;
      return await onConfirm!(message, confirmLabel, cancelLabel);
    } catch (e) {
      return false;
    }
  }

  /// Handle a structured question from the plugin (synapse.prompt()).
  /// The host decides the surface: chat message, dialog, or generated form.
  /// Resolves with `{cancelled: true}` on cancel or missing callback.
  Future<Map<String, dynamic>> _handlePrompt(
      Map<String, dynamic> payload) async {
    if (onPrompt == null) {
      return {'cancelled': true};
    }

    try {
      final values = await onPrompt!(payload);
      return values == null
          ? {'cancelled': true}
          : {'cancelled': false, 'values': values};
    } catch (e) {
      throw _BridgeReject('HOST_ERROR', e.toString());
    }
  }

  // =========================================================================
  // Auth Handlers
  // =========================================================================

  Future<bool> _handleAuthCheck(Map<String, dynamic> payload) async {
    final provider = payload['provider'] as String? ?? '';

    if (onAuthCheck == null) {
      return false;
    }

    try {
      return await onAuthCheck!(provider);
    } catch (e) {
      return false;
    }
  }

  Future<void> _handleAuthRequest(Map<String, dynamic> payload) async {
    final provider = payload['provider'] as String? ?? '';

    if (onAuthRequest == null) {
      throw const _BridgeReject(
          'HOST_ERROR', 'Authentication not implemented');
    }

    final success = await onAuthRequest!(provider);
    if (!success) {
      throw const _BridgeReject('HOST_ERROR', 'Authentication failed');
    }
  }

  // =========================================================================
  // Upload Handler
  // =========================================================================

  Future<Map<String, dynamic>> _handleUpload(
      Map<String, dynamic> payload) async {
    if (onUpload == null) {
      return {'success': false, 'error': 'Upload not implemented'};
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

      return {'success': true, 'response': result};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /// Dispose of the JavaScript runtime.
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(_engine.close());
  }
}

/// A host-level rejection of one bridge request, delivered to the SDK as a
/// structured `{__synapseError: {code, message}}` reply.
class _BridgeReject implements Exception {
  const _BridgeReject(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => '$code: $message';
}
