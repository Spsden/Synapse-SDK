/**
 * Synapse SDK — Global Type Declarations for Plugin Development
 * 
 * This file provides full IntelliSense, autocomplete, and hover documentation
 * for the `synapse` global available in all Synapse plugins.
 * 
 * Usage in your plugin project:
 *   1. Add `// @ts-check` at the top of your plugin.js
 *   2. Add `/// <reference path="./synapse-global.d.ts" />` (or use jsconfig.json)
 *   3. Enjoy full autocomplete and hover docs!
 */

// =============================================================================
// Core Types
// =============================================================================

/** Unique identifier for an intent (e.g., "create_event", "search") */
type SynapseIntent = string;

/** Generic key-value parameters passed to handlers */
type SynapseParams = Record<string, any>;

/**
 * Context object passed to intent handlers.
 * Contains rich information about what was shared and the AI's analysis.
 * 
 * @example
 * synapse.register('my_intent', async (ctx) => {
 *   const text = ctx.input.text;           // Raw/OCR text
 *   const title = ctx.llm.entities.title;  // AI-extracted entity
 *   const tz = ctx.user?.timezone;         // User's timezone
 * });
 */
interface SynapseContext {
    /** Information about the shared content */
    input: {
        /** Type of content that was shared */
        type: 'image' | 'text' | 'url' | 'file' | 'mixed';
        /** Raw or OCR-extracted text content */
        text?: string;
        /** Reference to image for uploads (blob://...) */
        imageRef?: string;
        /** Original URL if a link was shared */
        url?: string;
        /** Source application package/bundle ID */
        sourceApp?: string;
    };
    /** LLM analysis results */
    llm: {
        /** The detected intent name */
        intent: string;
        /** Extracted entities/parameters (e.g., title, date, content) */
        entities: Record<string, any>;
        /** Confidence score (0-1) */
        confidence?: number;
    };
    /** User context from the host */
    user?: {
        /** User's locale (e.g., "en-US") */
        locale?: string;
        /** User's timezone (e.g., "America/New_York") */
        timezone?: string;
    };
}

/** Handler function for processing intents */
type IntentHandler = (ctx: SynapseContext) => Promise<SynapseResult>;

/**
 * Result returned from intent handlers.
 * Use `synapse.success()` or `synapse.fail()` to create these.
 */
interface SynapseResult {
    status: 'success' | 'fail';
    /** Data to return to the host/user */
    data?: any;
    /** Error message if status is 'fail' */
    error?: string;
    /** Deep link to open after success (e.g., jira://issue/PROJ-123) */
    link?: string;
}

// =============================================================================
// Fetch / Network Types
// =============================================================================

/**
 * Request options for `synapse.fetch()`, mirroring the native fetch() API.
 * 
 * @example
 * await synapse.fetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ title: 'Hello' }),
 *   provider: 'notion'  // Host injects OAuth token
 * });
 */
interface SynapseRequestInit {
    /** HTTP method (defaults to GET) */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body (string or object) */
    body?: string | object;
    /** OAuth provider — the host automatically injects the Authorization header */
    provider?: string;
}

/**
 * Response object returned from `synapse.fetch()`.
 * Mirrors the native browser Response API.
 */
interface SynapseResponse {
    /** HTTP status code (e.g., 200, 404) */
    readonly status: number;
    /** True if status is in the 200-299 range */
    readonly ok: boolean;
    /** HTTP status text (e.g., "OK", "Not Found") */
    readonly statusText: string;
    /** Response headers */
    readonly headers: Record<string, string>;
    /**
     * Parse response body as JSON.
     * @throws Error if body has already been consumed or is not valid JSON.
     */
    json<T = any>(): Promise<T>;
    /**
     * Get response body as plain text.
     * @throws Error if body has already been consumed.
     */
    text(): Promise<string>;
}

// =============================================================================
// UI Types
// =============================================================================

/**
 * Options for `synapse.ui.show()`.
 */
interface UiShowOptions {
    /** Title for the modal/sheet */
    title?: string;
    /** Preferred width in pixels (ignored on mobile) */
    width?: number;
    /** Preferred height in pixels */
    height?: number;
    /** Presentation style */
    style?: 'modal' | 'sheet' | 'fullscreen';
}

// =============================================================================
// Storage Types
// =============================================================================

/** Value types that can be stored in plugin storage */
type StorageValue = string | number | boolean | object | null;

// =============================================================================
// Upload Types
// =============================================================================

/**
 * Parameters for `synapse.upload()`.
 * 
 * @example
 * const result = await synapse.upload({
 *   fileRef: ctx.input.imageRef,
 *   url: 'https://api.example.com/attachments',
 *   fieldName: 'file',
 *   provider: 'google'
 * });
 */
interface UploadParams {
    /** Reference to the file captured by the host (blob://...) */
    fileRef: string;
    /** Destination URL for the upload */
    url: string;
    /** HTTP method (defaults to POST) */
    method?: 'POST' | 'PUT';
    /** Additional headers */
    headers?: Record<string, string>;
    /** Form field name for the file (defaults to 'file') */
    fieldName?: string;
    /** Additional form fields to include */
    formFields?: Record<string, string>;
    /** OAuth provider for Authorization header */
    provider?: string;
}

/**
 * Result of a file upload.
 */
interface UploadResult {
    /** Whether the upload succeeded */
    success: boolean;
    /** Response body from the server */
    response?: any;
    /** Error message if failed */
    error?: string;
}

// =============================================================================
// System Types
// =============================================================================

/** Platform identifier returned by `synapse.system.platform()` */
type SynapsePlatform = 'ios' | 'macos' | 'android' | 'web' | 'windows' | 'linux';

/**
 * Options for `synapse.system.sendIntent()` (Android only).
 * 
 * @example
 * await synapse.system.sendIntent({
 *   action: 'android.intent.action.SEND',
 *   type: 'text/plain',
 *   package: 'com.google.android.keep',
 *   extras: { 'android.intent.extra.TEXT': 'Buy milk' }
 * });
 */
interface IntentOptions {
    /** Action to perform (e.g., "android.intent.action.SEND") */
    action: string;
    /** MIME type (e.g., "text/plain") */
    type?: string;
    /** Target package name (e.g., "com.google.android.keep") */
    package?: string;
    /** Target class name */
    class?: string;
    /** Intent category */
    category?: string;
    /** Extra data key-value pairs */
    extras?: Record<string, string | number | boolean>;
    /** Intent flags */
    flags?: number[];
}

/**
 * Options for `synapse.system.runAppleScript()` (macOS only).
 */
interface AppleScriptOptions {
    /** Timeout in milliseconds (default: 10000) */
    timeoutMs?: number;
}

// =============================================================================
// Calendar Types (EventKit)
// =============================================================================

/**
 * A calendar event returned from `synapse.system.calendar.getEvents()`.
 */
interface CalendarEvent {
    /** Unique event identifier */
    eventId: string;
    /** Event title */
    title: string;
    /** ISO 8601 start date */
    startDate: string;
    /** ISO 8601 end date */
    endDate: string;
    /** Whether this is an all-day event */
    allDay: boolean;
    /** Event notes/description */
    notes?: string;
    /** Event location */
    location?: string;
    /** Calendar ID this event belongs to */
    calendarId: string;
    /** Calendar title */
    calendarTitle?: string;
}

/**
 * Calendar info from `synapse.system.calendar.getCalendars()`.
 */
interface CalendarInfo {
    /** Unique calendar identifier */
    id: string;
    /** Calendar display title */
    title: string;
    /** Calendar color as hex string (e.g., "#FF5733") */
    color: string;
    /** Whether this is the user's default calendar */
    isDefault: boolean;
}

/**
 * Options for `synapse.system.calendar.getEvents()`.
 */
interface CalendarQueryOptions {
    /** ISO 8601 start date for the query range */
    startDate: string;
    /** ISO 8601 end date for the query range */
    endDate: string;
    /** Optional calendar ID to filter by */
    calendarId?: string;
}

/**
 * Parameters for `synapse.system.calendar.createEvent()`.
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
interface CalendarEventParams {
    /** Event title */
    title: string;
    /** ISO 8601 start date */
    startDate: string;
    /** ISO 8601 end date */
    endDate: string;
    /** Event notes/description */
    notes?: string;
    /** Event location */
    location?: string;
    /** Target calendar ID (uses default if omitted) */
    calendarId?: string;
    /** Whether this is an all-day event */
    allDay?: boolean;
}

// =============================================================================
// Config Types
// =============================================================================

/** Config field type for plugin settings UI */
type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select';

/**
 * Config field definition from plugin manifest.
 */
interface ConfigField {
    /** Unique key for the config value */
    key: string;
    /** Display label for UI */
    label: string;
    /** Field type */
    type: ConfigFieldType;
    /** Default value */
    default?: string;
    /** Help text */
    description?: string;
    /** Whether required */
    required?: boolean;
    /** Options for 'select' type */
    options?: string[];
}

/** Auth type for plugin manifest */
type AuthType = 'oauth2' | 'api_key' | 'none';

/**
 * Auth configuration from plugin manifest.
 */
interface AuthConfig {
    /** Type of authentication */
    type: AuthType;
    /** OAuth provider (for oauth2 type) */
    provider?: string;
    /** Required OAuth scopes */
    scopes?: string[];
}

// =============================================================================
// Synapse SDK Class (Global)
// =============================================================================

/**
 * The Synapse SDK — provides the complete API for plugins to interact
 * with the host application.
 * 
 * Available globally as `synapse` in all plugin code. No imports needed.
 * 
 * @example
 * synapse.register('create_event', async (ctx) => {
 *   const title = ctx.llm.entities.title;
 *   return synapse.success({ eventId: '123' });
 * });
 */
interface SynapseSDK {
    /**
     * Register a handler for a specific intent.
     * The handler will be called when the host dispatches this intent.
     * 
     * @param intent - The intent name (must match a trigger in manifest.json)
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
     *   return synapse.fail({ reason: 'api_error', message: 'Failed' });
     * });
     */
    register(intent: string, handler: IntentHandler): void;

    /**
     * Log a message to the host's debug console.
     * 
     * @param message - The message to log
     * 
     * @example
     * synapse.log('Processing started...');
     * synapse.log(`Found ${items.length} items`);
     */
    log(message: string): void;

    /**
     * Make an HTTP request through the host.
     * Mirrors the native `fetch()` API for familiarity.
     * 
     * **Important:** Plugins cannot access the network directly. All requests
     * are proxied through the host, which may inject authentication headers
     * for configured OAuth providers.
     * 
     * @param url - The URL to fetch
     * @param init - Request options (method, headers, body, provider)
     * @returns Promise resolving to a SynapseResponse
     * 
     * @example
     * // Simple GET request
     * const res = await synapse.fetch('https://api.example.com/users');
     * const users = await res.json();
     * 
     * @example
     * // POST with OAuth provider (host injects Authorization header)
     * const res = await synapse.fetch('https://api.notion.com/v1/pages', {
     *   method: 'POST',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ title: 'New Page' }),
     *   provider: 'notion'
     * });
     */
    fetch(url: string, init?: SynapseRequestInit): Promise<SynapseResponse>;

    /**
     * Upload a file to a remote server.
     * Used for uploading images/attachments captured by the host.
     * 
     * @param params - Upload parameters
     * @returns Upload result with success status and server response
     * 
     * @example
     * const result = await synapse.upload({
     *   fileRef: ctx.input.imageRef,
     *   url: 'https://api.example.com/attachments',
     *   fieldName: 'attachment',
     *   formFields: { ticketId: 'PROJ-123' },
     *   provider: 'google'
     * });
     */
    upload(params: UploadParams): Promise<UploadResult>;

    /**
     * Create a success result to return from your intent handler.
     * 
     * @param data - Data to include in the result
     * @returns SynapseResult with status 'success'
     * 
     * @example
     * return synapse.success({
     *   message: 'Note created!',
     *   data: { url: 'https://notion.so/page/123' }
     * });
     */
    success(data?: any): SynapseResult;

    /**
     * Create a failure result and notify the host.
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
    fail(error: { reason: string; message: string; retryable?: boolean }): SynapseResult;

    // =========================================================================
    // UI Namespace
    // =========================================================================

    /**
     * UI utilities for displaying plugin interfaces.
     * 
     * Use `synapse.ui.show()` to display custom HTML, `synapse.ui.toast()`
     * for brief messages, and `synapse.ui.confirm()` for yes/no dialogs.
     */
    ui: {
        /**
         * Display a custom HTML interface to the user.
         * Returns a promise that resolves when the UI sends data back.
         * 
         * Use `SynapseBridge.postMessage(data)` in your HTML to send data
         * back to the plugin and close the UI.
         * 
         * @param html - HTML content to display
         * @param options - Display options (title, size, style)
         * @returns Promise resolving to data sent from the UI via SynapseBridge.postMessage()
         * 
         * @example
         * const result = await synapse.ui.show(`
         *   <button onclick="SynapseBridge.postMessage({selected: 'A'})">
         *     Option A
         *   </button>
         * `, { title: 'Choose', width: 400, height: 300 });
         * console.log(result.selected); // 'A'
         */
        show(html: string, options?: UiShowOptions): Promise<any>;

        /**
         * Show a brief toast/snackbar message.
         * 
         * @param message - Message to display
         * @param duration - Duration in ms (default: 3000)
         * 
         * @example
         * await synapse.ui.toast('Note saved!');
         * await synapse.ui.toast('Processing...', 5000);
         */
        toast(message: string, duration?: number): Promise<void>;

        /**
         * Show a confirmation dialog (yes/no).
         * 
         * @param message - Question to ask the user
         * @param options - Custom button labels
         * @returns True if confirmed, false if cancelled
         * 
         * @example
         * const confirmed = await synapse.ui.confirm('Delete this item?');
         * if (confirmed) { ... }
         */
        confirm(message: string, options?: {
            confirmLabel?: string;
            cancelLabel?: string;
        }): Promise<boolean>;
    };

    // =========================================================================
    // Auth Namespace
    // =========================================================================

    /**
     * Authentication utilities.
     * OAuth flows are handled entirely by the host application.
     * Access tokens are **never** exposed to plugins — use `provider` in
     * `synapse.fetch()` to have the host inject the Authorization header.
     */
    auth: {
        /**
         * Check if the plugin is authenticated with a provider.
         * 
         * @param provider - Provider ID (e.g., "jira", "google", "notion")
         * @returns True if authenticated
         * 
         * @example
         * if (!await synapse.auth.isAuthenticated('notion')) {
         *   await synapse.auth.authenticate('notion');
         * }
         */
        isAuthenticated(provider: string): Promise<boolean>;

        /**
         * Trigger the OAuth flow for a provider.
         * The host opens a native browser for the OAuth flow.
         * 
         * @param provider - Provider ID configured in manifest.json
         * @throws Error if authentication fails or is cancelled
         * 
         * @example
         * await synapse.auth.authenticate('notion');
         * // Now synapse.fetch() with provider: 'notion' will include the token
         */
        authenticate(provider: string): Promise<void>;

        /**
         * Clear authentication for a provider (sign out).
         * 
         * @param provider - Provider ID
         */
        logout(provider: string): Promise<void>;
    };

    // =========================================================================
    // Storage Namespace
    // =========================================================================

    /**
     * Persistent key-value storage for plugin settings and data.
     * Storage is scoped per-plugin and persisted securely by the host.
     */
    storage: {
        /**
         * Get a value from storage.
         * 
         * @param key - Storage key
         * @returns The stored value, or undefined if not found
         * 
         * @example
         * const project = await synapse.storage.get('defaultProject');
         */
        get<T extends StorageValue>(key: string): Promise<T | undefined>;

        /**
         * Store a value.
         * 
         * @param key - Storage key
         * @param value - Value to store (string, number, boolean, or JSON-serializable object)
         * 
         * @example
         * await synapse.storage.set('defaultProject', 'PROJ-1');
         * await synapse.storage.set('settings', { theme: 'dark' });
         */
        set(key: string, value: StorageValue): Promise<void>;

        /**
         * Delete a value from storage.
         * @param key - Storage key to delete
         */
        delete(key: string): Promise<void>;

        /**
         * Clear all storage for this plugin.
         */
        clear(): Promise<void>;
    };

    // =========================================================================
    // Config Namespace
    // =========================================================================

    /**
     * Plugin configuration for API keys and user settings.
     * Values are stored encrypted and scoped to the plugin.
     * Config fields are declared in manifest.json — the host auto-generates UI.
     */
    config: {
        /**
         * Get a config value.
         * 
         * @param key - Config key as declared in manifest.json
         * @returns The config value or null if not set
         * 
         * @example
         * const apiKey = await synapse.config.get('openai_api_key');
         */
        get(key: string): Promise<string | null>;

        /**
         * Set a config value programmatically.
         * Note: Users typically set these via the plugin settings UI.
         * 
         * @param key - Config key
         * @param value - Value to store
         */
        set(key: string, value: string): Promise<void>;
    };

    // =========================================================================
    // System Namespace
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
    system: {
        /**
         * Get the current platform.
         * Use this for cross-platform plugins with graceful fallbacks.
         * 
         * @returns The current platform identifier
         * 
         * @example
         * const platform = await synapse.system.platform();
         * if (platform === 'macos') {
         *   await synapse.system.runAppleScript('tell application "Notes" to activate');
         * }
         */
        platform(): Promise<SynapsePlatform>;

        /**
         * Run an Apple Shortcut (iOS/macOS).
         * 
         * @param name - Name of the shortcut on the user's device
         * @param input - Optional text input for the shortcut
         * 
         * @example
         * await synapse.system.runShortcut('Save to Keep', 'Buy milk');
         */
        runShortcut(name: string, input?: string): Promise<void>;

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
        sendIntent(options: IntentOptions): Promise<void>;

        /**
         * Execute an AppleScript on macOS.
         * Requires 'applescript' permission in manifest.json.
         * 
         * The host validates that the script only targets apps declared in
         * the manifest's `allowedApps` list and blocks dangerous commands.
         * 
         * @param script - The AppleScript source code
         * @param options - Execution options (timeout)
         * @returns The script's return value as a string, or null
         * 
         * @example
         * const result = await synapse.system.runAppleScript(`
         *   tell application "Notes"
         *     make new note at folder "Notes" with properties {name:"Hello", body:"World"}
         *   end tell
         * `);
         */
        runAppleScript(script: string, options?: AppleScriptOptions): Promise<string | null>;

        /**
         * Calendar API powered by EventKit.
         * Requires 'calendar' permission in manifest.json.
         * Works on both iOS and macOS.
         */
        calendar: {
            /**
             * List available calendars on the device.
             * 
             * @returns Array of calendar info objects
             * 
             * @example
             * const calendars = await synapse.system.calendar.getCalendars();
             * const work = calendars.find(c => c.title === 'Work');
             */
            getCalendars(): Promise<CalendarInfo[]>;

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
            getEvents(options: CalendarQueryOptions): Promise<CalendarEvent[]>;

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
            createEvent(event: CalendarEventParams): Promise<{ eventId: string }>;
        };
    };
}

// =============================================================================
// Global Declarations
// =============================================================================

declare global {
    /**
     * The Synapse SDK instance — available globally in all plugin code.
     * 
     * Provides methods for:
     * - **Intent handling**: `synapse.register()`, `synapse.success()`, `synapse.fail()`
     * - **Network**: `synapse.fetch()`, `synapse.upload()`
     * - **UI**: `synapse.ui.show()`, `synapse.ui.toast()`, `synapse.ui.confirm()`
     * - **Auth**: `synapse.auth.authenticate()`, `synapse.auth.isAuthenticated()`
     * - **Storage**: `synapse.storage.get()`, `synapse.storage.set()`
     * - **Config**: `synapse.config.get()`, `synapse.config.set()`
     * - **System**: `synapse.system.platform()`, `synapse.system.calendar.*`, etc.
     * 
     * @example
     * synapse.register('my_intent', async (ctx) => {
     *   const title = ctx.llm.entities.title;
     *   synapse.log(`Processing: ${title}`);
     *   return synapse.success({ message: 'Done!' });
     * });
     */
    const synapse: SynapseSDK;

    /**
     * Bridge for communication from plugin UI back to plugin code.
     * Use this inside HTML passed to `synapse.ui.show()`.
     * 
     * @example
     * // Inside HTML shown via synapse.ui.show():
     * `<button onclick="SynapseBridge.postMessage({ action: 'selected', id: '123' })">
     *   Select
     * </button>`
     */
    const SynapseBridge: {
        /**
         * Send data from the UI back to the plugin.
         * This resolves the Promise returned by `synapse.ui.show()`.
         * 
         * @param data - Any JSON-serializable data to send back
         */
        postMessage(data: any): void;
    };
}

export {};
