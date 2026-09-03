import { SynapseBridgeEnvelope, SynapseBridgeError } from './types';

type NativeBridgeCall = (envelope: SynapseBridgeEnvelope) => Promise<unknown>;

/**
 * Failure reported by the host for a rejected bridge request.
 *
 * Hosts return these inside a successful reply as
 * `{ __synapseError: { code, message, retryable } }` so stable error codes
 * survive the transport; {@link Bridge.send} rethrows them as `BridgeError`.
 */
export class BridgeError extends Error {
    /** Stable machine-readable code, e.g. 'PERMISSION_DENIED'. */
    readonly code: string;
    /** Whether retrying the same request could succeed later. */
    readonly retryable: boolean;

    constructor(details: SynapseBridgeError) {
        super(details.message);
        this.name = 'BridgeError';
        this.code = details.code || 'BRIDGE_ERROR';
        this.retryable = Boolean(details.retryable);
    }
}

function readBridgeError(response: unknown): SynapseBridgeError | undefined {
    if (response == null || typeof response !== 'object') return undefined;
    const details = (response as { __synapseError?: unknown }).__synapseError;
    if (details == null || typeof details !== 'object') return undefined;
    const { code, message, retryable } = details as Record<string, unknown>;
    if (typeof message !== 'string' || message.length === 0) return undefined;
    return {
        code: typeof code === 'string' ? code : 'BRIDGE_ERROR',
        message,
        retryable: retryable === true,
    };
}

function captureNativeBridge(): NativeBridgeCall | null {
    const runtime = (globalThis as { fjs?: { bridge_call?: unknown } }).fjs;
    if (runtime == null || typeof runtime.bridge_call !== 'function') {
        return null;
    }
    // Bind before hiding the global: the runtime binding may need its
    // receiver, and only this module closure may talk to the host afterwards.
    const call = (runtime as { bridge_call: NativeBridgeCall }).bridge_call
        .bind(runtime);
    try {
        delete (globalThis as { fjs?: unknown }).fjs;
    } catch {
        // A non-configurable install stays exposed; hosts verify after load.
    }
    return call;
}

// Captured while the SDK bundle is evaluated, before any plugin code runs.
const nativeBridge = captureNativeBridge();

export class Bridge {
    /**
     * Whether the fjs-native request/response transport is active.
     */
    static isNative(): boolean {
        return nativeBridge !== null;
    }

    /**
     * Sends a message to the host (Flutter) through the fjs native bridge.
     *
     * If `expectResponse` is true, the promise resolves with the host reply
     * or rejects with a {@link BridgeError}. Otherwise delivery is
     * fire-and-forget and the reply (if any) is ignored.
     *
     * @param T Shape the caller expects from a responding host.
     */
    static async send<T = unknown>(
        type: string,
        payload: unknown = {},
        expectResponse = false
    ): Promise<T> {
        if (!nativeBridge) {
            console.warn(`[SynapseBridge] No host bridge available for: ${type}`);
            return undefined as T;
        }

        const reply = nativeBridge({ v: 2, type, payload });
        if (!expectResponse) {
            reply.catch(() => {});
            return undefined as T;
        }

        const response = await reply;
        const details = readBridgeError(response);
        if (details) throw new BridgeError(details);
        return response as T;
    }
}
