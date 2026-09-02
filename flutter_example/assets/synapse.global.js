"use strict";
var SynapseSDK = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    synapse: () => synapse
  });

  // src/bridge.ts
  var Bridge = class {
    /**
     * Sends a message to the host (Flutter).
     * If `expectResponse` is true, returns a Promise that resolves when Host replies.
     */
    static send(type, payload = {}, expectResponse = false) {
      const id = (this.requestIdCounter++).toString();
      const message = { type, id, payload };
      if (!expectResponse) {
        this._postMessage(message);
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
        this._postMessage(message);
      });
    }
    /**
     * Called by the Host to resolve a pending request.
     * e.g. synapse._bridge.resolve('123', { status: 200, data: ... })
     */
    static handleResponse(id, response, error) {
      const handler = this.pendingRequests.get(id);
      if (!handler) {
        console.warn(`[SynapseBridge] No pending request found for ID: ${id}`);
        return;
      }
      this.pendingRequests.delete(id);
      if (error) {
        handler.reject(new Error(error));
      } else {
        handler.resolve(response);
      }
    }
    static _postMessage(message) {
      if (typeof sendMessage === "function") {
        sendMessage("synapse", JSON.stringify(message));
      } else {
        console.warn("[SynapseBridge] Mock send:", message);
      }
    }
  };
  Bridge.pendingRequests = /* @__PURE__ */ new Map();
  Bridge.requestIdCounter = 0;

  // src/synapse.ts
  var SynapseResponse = class {
    constructor(data) {
      this._bodyUsed = false;
      this.status = data.status;
      this.ok = data.ok;
      this.statusText = data.statusText;
      this.headers = data.headers;
      this._body = data.body;
    }
    /**
     * Parse response body as JSON.
     * @throws Error if body has already been consumed or is not valid JSON.
     */
    async json() {
      if (this._bodyUsed) {
        throw new Error("Body has already been consumed");
      }
      this._bodyUsed = true;
      return JSON.parse(this._body);
    }
    /**
     * Get response body as plain text.
     * @throws Error if body has already been consumed.
     */
    async text() {
      if (this._bodyUsed) {
        throw new Error("Body has already been consumed");
      }
      this._bodyUsed = true;
      return this._body;
    }
  };
  var Synapse = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
      // =========================================================================
      // UI Namespace
      // =========================================================================
      /**
       * UI utilities for displaying plugin interfaces.
       */
      this.ui = {
        /**
         * Display a custom HTML interface to the user.
         * Returns a promise that resolves when the UI is closed or sends data back.
         * 
         * The HTML can communicate back to the plugin using:
         * ```javascript
         * SynapseBridge.postMessage({ action: 'submit', data: {...} });
         * ```
         * 
         * @param html - HTML content to display
         * @param options - Display options (title, size, style)
         * @returns Promise resolving to data sent from the UI
         * 
         * @example
         * const result = await synapse.ui.show(`
         *   <button onclick="SynapseBridge.postMessage({selected: 'optionA'})">
         *     Option A
         *   </button>
         * `, { title: 'Select an option' });
         * console.log(result.selected); // 'optionA'
         */
        show: async (html, options) => {
          return Bridge.send("ui_show", { html, options }, true);
        },
        /**
         * Show a brief toast/snackbar message.
         * 
         * @param message - Message to display
         * @param duration - Duration in ms (default: 3000)
         */
        toast: async (message, duration) => {
          await Bridge.send("ui_toast", { message, duration: duration || 3e3 });
        },
        /**
         * Show a confirmation dialog.
         * 
         * @param message - Question to ask
         * @param options - Button labels
         * @returns True if confirmed, false otherwise
         */
        confirm: async (message, options) => {
          return Bridge.send("ui_confirm", { message, ...options }, true);
        }
      };
      // =========================================================================
      // Auth Namespace
      // =========================================================================
      /**
       * Authentication utilities.
       * OAuth flows are handled entirely by the host application.
       * Plugins just need to check auth status and trigger flows.
       */
      this.auth = {
        /**
         * Check if the plugin is authenticated with a provider.
         * 
         * @param provider - Provider ID (e.g., "jira", "google", "notion")
         * @returns True if authenticated
         * 
         * @example
         * if (!await synapse.auth.isAuthenticated('jira')) {
         *   await synapse.auth.authenticate('jira');
         * }
         */
        isAuthenticated: async (provider) => {
          return Bridge.send("auth_check", { provider }, true);
        },
        /**
         * Trigger the OAuth flow for a provider.
         * The host will open the native OAuth browser and handle the flow.
         * 
         * @param provider - Provider ID configured in the plugin manifest
         * @throws Error if authentication fails or is cancelled
         * 
         * @example
         * try {
         *   await synapse.auth.authenticate('notion');
         *   // User is now authenticated, subsequent fetch calls will include token
         * } catch (e) {
         *   console.log('User cancelled authentication');
         * }
         */
        authenticate: async (provider) => {
          return Bridge.send("auth_authenticate", { provider }, true);
        },
        /**
         * Clear authentication for a provider.
         * 
         * @param provider - Provider ID
         */
        logout: async (provider) => {
          await Bridge.send("auth_logout", { provider });
        }
        // Access tokens are never exposed to plugins. Use synapse.fetch
        // with `provider` to get Authorization injected by the host.
      };
      // =========================================================================
      // Storage Namespace
      // =========================================================================
      /**
       * Persistent key-value storage for plugin settings and data.
       * Storage is scoped per-plugin and persisted securely by the host.
       */
      this.storage = {
        /**
         * Get a value from storage.
         * 
         * @param key - Storage key
         * @returns The stored value, or undefined if not found
         * 
         * @example
         * const defaultProject = await synapse.storage.get('defaultProject');
         */
        get: async (key) => {
          return Bridge.send("storage_get", { key }, true);
        },
        /**
         * Store a value.
         * 
         * @param key - Storage key
         * @param value - Value to store (string, number, boolean, or JSON-serializable object)
         * 
         * @example
         * await synapse.storage.set('defaultProject', 'PROJ-1');
         * await synapse.storage.set('settings', { theme: 'dark', notifications: true });
         */
        set: async (key, value) => {
          await Bridge.send("storage_set", { key, value });
        },
        /**
         * Delete a value from storage.
         * 
         * @param key - Storage key to delete
         */
        delete: async (key) => {
          await Bridge.send("storage_delete", { key });
        },
        /**
         * Clear all storage for this plugin.
         */
        clear: async () => {
          await Bridge.send("storage_clear", {});
        }
      };
      // =========================================================================
      // Config Namespace
      // =========================================================================
      /**
       * Plugin configuration for API keys and user settings.
       * Values are stored encrypted and scoped to the plugin.
       * Config fields are declared in plugin.json and the host auto-generates UI.
       */
      this.config = {
        /**
         * Get a config value.
          *
          * @param key - Config key as declared in plugin.json
         * @returns The config value or null if not set
          *
          * @example
         * const apiKey = await synapse.config.get('openai_api_key');
         */
        get: async (key) => {
          return Bridge.send("config_get", { key }, true);
        },
        /**
         * Set a config value programmatically.
         * Note: Users typically set these via the plugin settings UI.
          *
          * @param key - Config key
         * @param value - Value to store
         */
        set: async (key, value) => {
          await Bridge.send("config_set", { key, value });
        }
      };
      // =========================================================================
      // System Namespace (Shortcuts, Intents, AppleScript & EventKit)
      // =========================================================================
      /**
       * System utilities for OS-level integration.
        *
        * Provides access to:
       * - **Shortcuts** (iOS/macOS) — trigger Apple Shortcuts
       * - **Intents** (Android) — send Android Intents
       * - **AppleScript** (macOS) — execute AppleScript for any scriptable app
       * - **Calendar** (iOS/macOS) — read/write calendar events via EventKit
       * - **Platform** — detect the current OS
       */
      this.system = {
        /**
         * Get the current platform.
         * Use this to build cross-platform plugins with graceful fallbacks.
          *
          * @returns The current platform identifier
          *
          * @example
         * const platform = await synapse.system.platform();
         * if (platform === 'macos') {
         *   await synapse.system.runAppleScript('tell application "Notes" to activate');
         * } else {
         *   await synapse.system.runShortcut('Open Notes');
         * }
         */
        platform: async () => {
          return Bridge.send("system_platform", {}, true);
        },
        /**
         * Run an iOS Shortcut.
          *
          * @param name - Name of the shortcut on the user's device
         * @param input - Optional text input for the shortcut
          *
          * @example
         * await synapse.system.runShortcut('Save to Keep', 'Buy milk');
         */
        runShortcut: async (name, input) => {
          return Bridge.send("system_runShortcut", { name, input }, true);
        },
        /**
         * Send an Android Intent.
          *
          * @param options - Intent configuration
          *
          * @example
         * await synapse.system.sendIntent({
         *   action: 'android.intent.action.SEND',
         *   type: 'text/plain',
         *   package: 'com.google.android.keep',
         *   extras: { 'android.intent.extra.TEXT': 'Buy milk' }
         * });
         */
        sendIntent: async (options) => {
          return Bridge.send("system_sendIntent", options, true);
        },
        // =====================================================================
        // AppleScript (macOS only)
        // =====================================================================
        /**
         * Execute an AppleScript on macOS.
         * Requires 'applescript' permission in the plugin manifest.
          *
          * The host validates that the script only targets apps declared in
         * the manifest's `allowedApps` list, and blocks dangerous commands
         * like `do shell script`.
          *
          * @param script - The AppleScript source code to execute
         * @param options - Execution options (timeout, etc.)
         * @returns The script's return value as a string, or null
          *
          * @example
         * // Create an Apple Note
         * const result = await synapse.system.runAppleScript(`
         *   tell application "Notes"
         *     make new note at folder "Notes" with properties {name:"Hello", body:"World"}
         *   end tell
         * `);
          *
          * @example
         * // Get current track from Apple Music
         * const track = await synapse.system.runAppleScript(`
         *   tell application "Music"
         *     if player state is playing then
         *       return name of current track
         *     end if
         *   end tell
         * `);
         */
        runAppleScript: async (script, options) => {
          return Bridge.send("system_runAppleScript", {
            script,
            timeoutMs: options?.timeoutMs ?? 1e4
          }, true);
        },
        // =====================================================================
        // EventKit Calendar (iOS & macOS)
        // =====================================================================
        /**
         * Calendar API powered by EventKit.
         * Requires 'calendar' permission in the plugin manifest.
         * Works on both iOS and macOS.
         */
        calendar: {
          /**
           * List available calendars.
            *
            * @returns Array of calendar info objects
            *
            * @example
           * const calendars = await synapse.system.calendar.getCalendars();
           * const work = calendars.find(c => c.title === 'Work');
           */
          getCalendars: async () => {
            return Bridge.send("system_calendar_getCalendars", {}, true);
          },
          /**
           * Query calendar events within a date range.
            *
            * @param options - Query parameters (date range, optional calendar filter)
           * @returns Array of calendar events
            *
            * @example
           * const events = await synapse.system.calendar.getEvents({
           *   startDate: '2026-04-06T00:00:00',
           *   endDate: '2026-04-07T00:00:00'
           * });
           */
          getEvents: async (options) => {
            return Bridge.send("system_calendar_getEvents", options, true);
          },
          /**
           * Create a new calendar event.
            *
            * @param event - Event parameters
           * @returns Object with the created event's ID
            *
            * @example
           * const { eventId } = await synapse.system.calendar.createEvent({
           *   title: 'Team Standup',
           *   startDate: '2026-04-07T09:00:00',
           *   endDate: '2026-04-07T09:30:00',
           *   notes: 'Daily sync',
           *   location: 'Zoom'
           * });
           */
          createEvent: async (event) => {
            return Bridge.send("system_calendar_createEvent", event, true);
          }
        }
      };
      // =========================================================================
      // Internal Bridge
      // =========================================================================
      /**
       * Internal bridge methods for host communication.
       * @internal
       */
      this._bridge = {
        resolve: (id, response, error) => Bridge.handleResponse(id, response, error)
      };
    }
    // =========================================================================
    // Intent Registration
    // =========================================================================
    /**
     * Register a handler for a specific intent.
     * The handler will be called when the host dispatches this intent.
     * 
     * @param intent - The intent name (e.g., "create_event", "search")
     * @param handler - Async function to handle the intent
     * 
     * @example
     * synapse.register('create_jira_ticket', async (ctx) => {
     *   const { title, description } = ctx.llm.entities;
     *   const res = await synapse.fetch('https://jira.example.com/api/issues', {
     *     method: 'POST',
     *     body: JSON.stringify({ title, description })
     *   });
     *   if (res.ok) {
     *     return synapse.success({ ticketId: 'PROJ-123' });
     *   }
     *   return synapse.fail({ reason: 'api_error', message: 'Failed to create ticket' });
     * });
     */
    register(intent, handler) {
      this.handlers.set(intent, handler);
      Bridge.send("log", { message: `[Synapse] Registered intent: ${intent}` });
    }
    /**
     * Log a message to the host.
     * @param message - The message to log
     */
    log(message) {
      Bridge.send("log", { message });
    }
    /**
     * Internal: Called by the host to dispatch an intent.
     * @internal
     */
    async _dispatch(intent, params) {
      const handler = this.handlers.get(intent);
      const ctx = {
        input: params.input || { type: "text" },
        llm: params.llm || { intent, entities: { ...params } },
        user: params.user,
        execution: params.execution
      };
      if (!handler) {
        Bridge.send("finished", this.fail({
          reason: "not_implemented",
          message: `No handler registered for intent: ${intent}`
        }));
        return;
      }
      try {
        const result = await handler(ctx);
        Bridge.send("finished", result);
      } catch (e) {
        Bridge.send("finished", this.fail({
          reason: "execution_error",
          message: e instanceof Error ? e.message : String(e)
        }));
      }
    }
    // =========================================================================
    // Fetch API (Network)
    // =========================================================================
    /**
     * Make an HTTP request through the host.
     * Mirrors the native fetch() API for familiarity.
     * 
     * Note: Plugins cannot access the network directly. All requests
     * are proxied through the host, which may inject authentication
     * headers for configured OAuth providers.
     * 
     * @param url - The URL to fetch
     * @param init - Request options (method, headers, body)
     * @returns Promise resolving to a SynapseResponse
     * 
     * @example
     * // GET request
     * const res = await synapse.fetch('https://api.example.com/users');
     * const users = await res.json();
     * 
     * @example
     * // POST request with JSON body
     * const res = await synapse.fetch('https://api.example.com/users', {
     *   method: 'POST',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ name: 'John' }),
     *   provider: 'google'
     * });
     */
    async fetch(url, init) {
      const request = {
        url,
        method: init?.method || "GET",
        headers: init?.headers || {},
        body: typeof init?.body === "object" ? JSON.stringify(init.body) : init?.body,
        provider: init?.provider
      };
      const responseData = await Bridge.send("fetch", request, true);
      return new SynapseResponse(responseData);
    }
    // =========================================================================
    // Prompt (surface-agnostic user questions)
    // =========================================================================
    /**
     * Ask the user a structured question and wait for the answer.
     *
     * Unlike `synapse.ui.show()` (explicit HTML, best for share-capture
     * flows), `prompt()` is declarative: the host renders it on whatever
     * surface the run started from. In a chat run the question is asked
     * inside the conversation; in a share run the host shows a form
     * (dialog or generated UI). Plugins should use this only when the
     * dispatch context advertises `execution.capabilities.prompt`.
     *
     * @param spec - The question and its input fields
     * @returns The user's answers, or `{ cancelled: true }` if dismissed
     *
     * @example
     * const result = await synapse.prompt({
     *   message: 'Which playlist?',
     *   fields: [{
     *     name: 'playlist',
     *     type: 'select',
     *     label: 'Playlist',
     *     required: true,
     *     options: [
     *       { value: 'p1', label: 'Road Trip' },
     *     ]
     *   }]
     * });
     * if (!result.cancelled && result.values) {
     *   addTrack(result.values.playlist);
     * }
     */
    async prompt(spec) {
      return Bridge.send("prompt", spec, true);
    }
    // =========================================================================
    // Upload
    // =========================================================================
    /**
     * Upload a file to a remote server.
     * Used for uploading images/attachments captured by the host.
     * 
     * @param params - Upload parameters
     * @returns Upload result with success status and server response
     * 
     * @example
     * const result = await synapse.upload({
     *   fileRef: ctx.input.imageRef,  // blob://capture_123
     *   url: 'https://api.example.com/attachments',
     *   fieldName: 'attachment',
     *   formFields: { ticketId: 'PROJ-123' },
     *   provider: 'google'
     * });
     */
    async upload(params) {
      return Bridge.send("upload", params, true);
    }
    // =========================================================================
    // Result Helpers
    // =========================================================================
    /**
     * Create a success result.
     * 
     * @param data - Data to include in the result
     * @returns SynapseResult with status 'success'
     * 
     * @example
     * return synapse.success({ 
     *   ticketId: 'PROJ-123',
     *   link: 'https://jira.example.com/browse/PROJ-123'
     * });
     */
    success(data = {}) {
      return {
        status: "success",
        data,
        link: data.link
      };
    }
    /**
     * Create a failure result. Return it from an intent handler so the
     * dispatcher can notify the host exactly once.
     * 
     * @param error - Error details
     * @returns SynapseResult with status 'fail'
     * 
     * @example
     * return synapse.fail({ 
     *   reason: 'validation_error',
     *   message: 'Title is required',
     *   retryable: true
     * });
     */
    fail(error) {
      return {
        status: "fail",
        error: error.message
      };
    }
  };
  var synapse = new Synapse();
  globalThis.synapse = synapse;
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=index.global.js.map
