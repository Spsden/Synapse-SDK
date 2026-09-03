/**
 * Synapse SDK Types
 * 
 * This file defines the core types for the Synapse Plugin System.
 * The API is designed to feel familiar to web developers, mirroring
 * native browser APIs like fetch() where possible.
 */

// =============================================================================
// Core Types
// =============================================================================

/** Unique identifier for an intent (e.g., "create_event", "search") */
export type SynapseIntent = string;

/** Generic key-value parameters passed to handlers */
export type SynapseParams = Record<string, any>;

/**
 * Context object passed to intent handlers.
 * Contains rich information about what was shared and the AI's analysis.
 */
export interface SynapseContext {
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
        /** Extracted entities/parameters */
        entities: Record<string, any>;
        /** Confidence score (0-1) */
        confidence?: number;
    };
    /** User context from the host */
    user?: {
        locale?: string;
        timezone?: string;
    };
    /**
     * Where this run started. The host renders `synapse.prompt()` with its
     * native UI for the current surface.
     */
    execution?: {
        surface: 'share' | 'chat';
        /** Host capabilities available on the current execution surface. */
        capabilities?: {
            /** Whether the host can render and answer `synapse.prompt()` calls. */
            prompt?: boolean;
        };
    };
}

// =============================================================================
// Prompt Types
// =============================================================================

/** A single input field in a `synapse.prompt()` question. */
export interface PromptField {
    /** Key in the returned values map */
    name: string;
    /** `text` is a free-text input, `select` is a single choice from options */
    type: 'text' | 'select';
    /** Human-readable field label */
    label: string;
    /** Placeholder text (text fields only) */
    placeholder?: string;
    /** Whether the host should require a value before submitting */
    required?: boolean;
    /** Pre-selected/pre-filled value */
    defaultValue?: string;
    /** Choices for `select` fields */
    options?: Array<{ value: string; label: string }>;
}

/** A structured question the host can render on any surface. */
export interface PromptSpec {
    /** The question to show the user */
    message: string;
    /** Input fields; usually one — keep prompts small */
    fields: PromptField[];
}

/** Result of `synapse.prompt()`. */
export interface PromptResult {
    /** True if the user dismissed/cancelled the question */
    cancelled: boolean;
    /** Map of field name → user answer (absent when cancelled) */
    values?: Record<string, string>;
}

/** Host-supplied payload for one dispatch; becomes the handler's context. */
export interface SynapseDispatchParams {
    input?: SynapseContext['input'];
    llm?: SynapseContext['llm'];
    user?: SynapseContext['user'];
    execution?: SynapseContext['execution'];
}

/** Handler function for processing intents */
export type IntentHandler = (ctx: SynapseContext) => Promise<SynapseResult>;

/**
 * Result returned from intent handlers.
 */
export interface SynapseResult {
    status: 'success' | 'fail';
    /** Data to return to the host/user */
    data?: any;
    /** Error message if status is 'fail' */
    error?: string;
    /** Deep link to open after success (e.g., jira://issue/PROJ-123) */
    link?: string;
}

// =============================================================================
// Fetch-like Network Types
// =============================================================================

/**
 * Request initialization options, mirroring the native fetch() API.
 */
export interface SynapseRequestInit {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: string | object;
    /** OAuth provider to use for Authorization header (host-injected) */
    provider?: string;
    /** Manifest v2 connection alias to use for host-injected authorization. */
    connection?: string;
}

/**
 * Response object returned from synapse.fetch().
 * Mirrors the native Response API for familiarity.
 */
export interface SynapseResponseData {
    /** HTTP status code */
    status: number;
    /** True if status is 200-299 */
    ok: boolean;
    /** Status text (e.g., "OK", "Not Found") */
    statusText: string;
    /** Response headers */
    headers: Record<string, string>;
    /** Raw response body as string */
    body: string;
}

// =============================================================================
// Storage Types
// =============================================================================

/** Value types that can be stored */
export type StorageValue = string | number | boolean | object | null;

// =============================================================================
// Upload Types
// =============================================================================

/**
 * Parameters for file uploads.
 */
export interface UploadParams {
    /** Reference to the file (blob://...) */
    fileRef: string;
    /** Destination URL */
    url: string;
    /** HTTP method (defaults to POST) */
    method?: 'POST' | 'PUT';
    /** Additional headers */
    headers?: Record<string, string>;
    /** Form field name for the file (defaults to 'file') */
    fieldName?: string;
    /** Additional form fields to include */
    formFields?: Record<string, string>;
    /** OAuth provider to use for Authorization header (host-injected) */
    provider?: string;
}

/**
 * Result of a file upload.
 */
export interface UploadResult {
    success: boolean;
    /** Response from the server */
    response?: any;
    /** Error message if failed */
    error?: string;
}

// =============================================================================
// Internal Bridge Types
// =============================================================================

/** Internal message format for host communication */
export interface BridgeMessage {
    type: string;
    id?: string;
    payload?: any;
}

/**
 * Envelope for the fjs-native host transport (protocol v2).
 *
 * fjs exposes one `fjs.bridge_call(value)` entry point whose Dart side
 * receives the value verbatim and resolves the calling promise with its
 * reply, so requests travel as a single structured object instead of the
 * legacy channel + JSON-string pair.
 */
export interface SynapseBridgeEnvelope {
    /** Envelope version. Hosts reject envelopes they do not understand. */
    v: 2;
    type: string;
    payload?: unknown;
}

/**
 * Structured failure a host returns inside a successful bridge reply, as
 * `{ __synapseError: SynapseBridgeError }`. Carried in the value layer
 * because transport-level errors are message-only.
 */
export interface SynapseBridgeError {
    /** Stable machine-readable code, e.g. 'PERMISSION_DENIED'. */
    code?: string;
    message: string;
    /** Whether retrying the same request could succeed later. */
    retryable?: boolean;
}

// =============================================================================
// Config Types
// =============================================================================

/** Config field type for plugin settings UI */
export type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select';

/**
 * Config field definition from manifest.json manifest.
 */
export interface ConfigField {
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

// =============================================================================
// Auth Types  
// =============================================================================

/** Auth type for plugin manifest */
export type AuthType = 'oauth2' | 'api_key' | 'none';

/**
 * Auth configuration from manifest.json manifest.
 */
export interface AuthConfig {
    /** Type of authentication */
    type: AuthType;
    /** OAuth provider (for oauth2 type) */
    provider?: string;
    /** Required OAuth scopes */
    scopes?: string[];
}

export type ConnectionType = 'oauth2' | 'api_key' | 'none';

export interface ConnectionRequirement {
    alias: string;
    provider: string;
    type: ConnectionType;
    scopes?: string[];
    optional?: boolean;
}

export type PluginCapabilityRequirement =
    | { kind: 'connection'; alias: string }
    | {
        kind: 'mcp';
        serverId: string;
        allow: { tools: string[] };
        optional?: boolean;
    }
    | { kind: 'host'; capability: string; optional?: boolean }
    | { kind: 'network'; domains: string[]; optional?: boolean };

export interface PluginAction {
    id: string;
    description?: string;
    triggers: string[];
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    requirements?: PluginCapabilityRequirement[];
    platforms?: SynapsePlatform[];
}

// =============================================================================
// System Types
// =============================================================================

/** Platform identifier returned by synapse.system.platform() */
export type SynapsePlatform = 'ios' | 'macos' | 'android' | 'web' | 'windows' | 'linux';

/**
 * Options for sending Android Intents
 */
export interface IntentOptions {
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
 * Options for AppleScript execution (macOS only).
 * Requires 'applescript' permission in plugin manifest.
 */
export interface AppleScriptOptions {
    /** Timeout in milliseconds (default: 10000) */
    timeoutMs?: number;
}

// =============================================================================
// EventKit Types (Calendar & Reminders)
// =============================================================================

/**
 * A calendar event returned from synapse.system.calendar.getEvents().
 */
export interface CalendarEvent {
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
 * Calendar info returned from synapse.system.calendar.getCalendars().
 */
export interface CalendarInfo {
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
 * Options for querying calendar events.
 */
export interface CalendarQueryOptions {
    /** ISO 8601 start date for the query range */
    startDate: string;
    /** ISO 8601 end date for the query range */
    endDate: string;
    /** Optional calendar ID to filter by */
    calendarId?: string;
}

/**
 * Parameters for creating a calendar event.
 */
export interface CalendarEventParams {
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
// MCP Types
// =============================================================================

/**
 * Options for executing an MCP tool call.
 */
export interface McpCallOptions {
    /** Timeout in milliseconds (default: 10000) */
    timeoutMs?: number;
}

/**
 * Wrapped response structure returned by synapse.mcp.callTool().
 */
export interface McpCallResult<T = any> {
    /** True if the tool executed successfully and returned data */
    success: boolean;
    /** Output payload returned from the tool (if successful) */
    data?: T;
    /** User-friendly error message if failed */
    error?: string;
    /** System error code (if failed) */
    code?: string;
}
