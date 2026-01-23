import { Bridge } from './bridge';
import {
    IntentHandler,
    SynapseContext,
    SynapseResult,
    SynapseRequestInit,
    SynapseResponseData,
    UiShowOptions,
    UploadParams,
    UploadResult,
    StorageValue
} from './types';

// =============================================================================
// SynapseResponse Class
// =============================================================================

/**
 * Response object returned from synapse.fetch().
 * Mirrors the native browser Response API for familiarity.
 * 
 * @example
 * const res = await synapse.fetch('https://api.example.com/data');
 * if (res.ok) {
 *   const data = await res.json();
 * }
 */
export class SynapseResponse {
    /** HTTP status code (e.g., 200, 404) */
    readonly status: number;
    /** True if status is in the 200-299 range */
    readonly ok: boolean;
    /** HTTP status text (e.g., "OK", "Not Found") */
    readonly statusText: string;
    /** Response headers */
    readonly headers: Record<string, string>;

    private _body: string;
    private _bodyUsed: boolean = false;

    constructor(data: SynapseResponseData) {
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
    async json<T = any>(): Promise<T> {
        if (this._bodyUsed) {
            throw new Error('Body has already been consumed');
        }
        this._bodyUsed = true;
        return JSON.parse(this._body);
    }

    /**
     * Get response body as plain text.
     * @throws Error if body has already been consumed.
     */
    async text(): Promise<string> {
        if (this._bodyUsed) {
            throw new Error('Body has already been consumed');
        }
        this._bodyUsed = true;
        return this._body;
    }
}

// =============================================================================
// Synapse Class
// =============================================================================

/**
 * Main Synapse SDK class.
 * Provides the API for plugins to interact with the host application.
 * 
 * @example
 * // Register an intent handler
 * synapse.register('create_event', async (ctx) => {
 *   const title = ctx.llm.entities.title;
 *   // Create event...
 *   return synapse.success({ eventId: '123' });
 * });
 */
export class Synapse {
    private handlers = new Map<string, IntentHandler>();

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
    register(intent: string, handler: IntentHandler): void {
        this.handlers.set(intent, handler);
        Bridge.send('log', { message: `[Synapse] Registered intent: ${intent}` });
    }

    /**
     * Log a message to the host.
     * @param message - The message to log
     */
    log(message: string): void {
        Bridge.send('log', { message });
    }

    /**
     * Internal: Called by the host to dispatch an intent.
     * @internal
     */
    async _dispatch(intent: string, params: any): Promise<void> {
        const handler = this.handlers.get(intent);

        // Build the context object from params
        const ctx: SynapseContext = {
            input: params.input || { type: 'text' },
            llm: params.llm || { intent, entities: params },
            user: params.user
        };

        if (!handler) {
            return this.fail({
                reason: 'not_implemented',
                message: `No handler registered for intent: ${intent}`
            }) as any;
        }

        try {
            const result = await handler(ctx);
            Bridge.send('finished', result);
        } catch (e: any) {
            this.fail({
                reason: 'execution_error',
                message: e.message || 'Unknown error during execution'
            });
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
     *   body: JSON.stringify({ name: 'John' })
     * });
     */
    async fetch(url: string, init?: SynapseRequestInit): Promise<SynapseResponse> {
        const request = {
            url,
            method: init?.method || 'GET',
            headers: init?.headers || {},
            body: typeof init?.body === 'object' ? JSON.stringify(init.body) : init?.body
        };

        const responseData = await Bridge.send('fetch', request, true);
        return new SynapseResponse(responseData);
    }

    // =========================================================================
    // UI Namespace
    // =========================================================================

    /**
     * UI utilities for displaying plugin interfaces.
     */
    ui = {
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
        show: async (html: string, options?: UiShowOptions): Promise<any> => {
            return Bridge.send('ui_show', { html, options }, true);
        },

        /**
         * Show a brief toast/snackbar message.
         * 
         * @param message - Message to display
         * @param duration - Duration in ms (default: 3000)
         */
        toast: async (message: string, duration?: number): Promise<void> => {
            await Bridge.send('ui_toast', { message, duration: duration || 3000 });
        },

        /**
         * Show a confirmation dialog.
         * 
         * @param message - Question to ask
         * @param options - Button labels
         * @returns True if confirmed, false otherwise
         */
        confirm: async (message: string, options?: {
            confirmLabel?: string;
            cancelLabel?: string
        }): Promise<boolean> => {
            return Bridge.send('ui_confirm', { message, ...options }, true);
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
    auth = {
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
        isAuthenticated: async (provider: string): Promise<boolean> => {
            return Bridge.send('auth_check', { provider }, true);
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
        authenticate: async (provider: string): Promise<void> => {
            return Bridge.send('auth_authenticate', { provider }, true);
        },

        /**
         * Clear authentication for a provider.
         * 
         * @param provider - Provider ID
         */
        logout: async (provider: string): Promise<void> => {
            await Bridge.send('auth_logout', { provider });
        }
    };

    // =========================================================================
    // Storage Namespace
    // =========================================================================

    /**
     * Persistent key-value storage for plugin settings and data.
     * Storage is scoped per-plugin and persisted securely by the host.
     */
    storage = {
        /**
         * Get a value from storage.
         * 
         * @param key - Storage key
         * @returns The stored value, or undefined if not found
         * 
         * @example
         * const defaultProject = await synapse.storage.get('defaultProject');
         */
        get: async <T extends StorageValue>(key: string): Promise<T | undefined> => {
            return Bridge.send('storage_get', { key }, true);
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
        set: async (key: string, value: StorageValue): Promise<void> => {
            await Bridge.send('storage_set', { key, value });
        },

        /**
         * Delete a value from storage.
         * 
         * @param key - Storage key to delete
         */
        delete: async (key: string): Promise<void> => {
            await Bridge.send('storage_delete', { key });
        },

        /**
         * Clear all storage for this plugin.
         */
        clear: async (): Promise<void> => {
            await Bridge.send('storage_clear', {});
        }
    };

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
     *   formFields: { ticketId: 'PROJ-123' }
     * });
     */
    async upload(params: UploadParams): Promise<UploadResult> {
        return Bridge.send('upload', params, true);
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
    success(data: any = {}): SynapseResult {
        return {
            status: 'success',
            data,
            link: data.link
        };
    }

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
    fail(error: { reason: string; message: string; retryable?: boolean }): SynapseResult {
        Bridge.send('finished', { status: 'error', ...error });
        return {
            status: 'fail',
            error: error.message
        };
    }

    // =========================================================================
    // Internal Bridge
    // =========================================================================

    /**
     * Internal bridge methods for host communication.
     * @internal
     */
    _bridge = {
        resolve: (id: string, response: any, error?: string) =>
            Bridge.handleResponse(id, response, error)
    };
}

// =============================================================================
// Singleton Export
// =============================================================================

/** Global Synapse SDK instance */
export const synapse = new Synapse();

// Expose on globalThis for direct access from evaluated plugin code
(globalThis as any).synapse = synapse;
