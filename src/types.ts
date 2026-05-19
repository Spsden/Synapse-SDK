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
// UI Types
// =============================================================================

/**
 * Options for displaying plugin UI.
 */
export interface UiShowOptions {
    /** Title for the modal/sheet */
    title?: string;
    /** Preferred width (ignored on mobile) */
    width?: number;
    /** Preferred height */
    height?: number;
    /** Presentation style */
    style?: 'modal' | 'sheet' | 'fullscreen';
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

// =============================================================================
// Config Types
// =============================================================================

/** Config field type for plugin settings UI */
export type ConfigFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select';

/**
 * Config field definition from plugin.json manifest.
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
 * Auth configuration from plugin.json manifest.
 */
export interface AuthConfig {
    /** Type of authentication */
    type: AuthType;
    /** OAuth provider (for oauth2 type) */
    provider?: string;
    /** Required OAuth scopes */
    scopes?: string[];
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
