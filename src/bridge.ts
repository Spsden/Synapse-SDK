import { BridgeMessage, SynapseBridgeEnvelope, SynapseBridgeError } from './types';

// Legacy transport: global injected by flutter_js-era hosts.
declare global {
    function sendMessage(channel: string, message: string): void;
}

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
    // The cast is unchecked because the runtime owns the injected binding's
    // type; the typeof check above is the runtime guard.
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
    private static readonly pendingRequests = new Map<
        string,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >();
    private static requestIdCounter = 0;

    /**
     * Whether the fjs-native request/response transport is active. When true,
     * hosts read the `_dispatch` return value instead of a `finished` event.
     */
    static isNative(): boolean {
        return nativeBridge !== null;
    }

    /**
     * Sends a message to the host (Flutter).
     *
     * If `expectResponse` is true, the promise resolves with the host reply
     * or rejects with a {@link BridgeError}. Otherwise delivery is
     * fire-and-forget and the reply (if any) is ignored.
     *
     * @param T Shape the caller expects from a responding host; the transport
     * itself carries unvalidated host data, so treat results as trusted only
     * as far as you trust the host build.
     */
    static send<T = unknown>(
        type: string,
        payload: unknown = {},
        expectResponse = false
    ): Promise<T> {
        return nativeBridge
            ? Bridge.sendNative(nativeBridge, type, payload, expectResponse)
            : Bridge.sendLegacy(type, payload, expectResponse);
    }

    /**
     * Called by legacy hosts to resolve a pending request.
     * e.g. synapse._bridge.resolve('123', { status: 200, data: ... })
     */
    static handleResponse(id: string, response: unknown, error?: string) {
        const handler = this.pendingRequests.get(id);
        if (!handler) {
            console.warn(`[SynapseBridge] No pending request found for ID: ${id}`);
            return;
        }

        this.pendingRequests.delete(id);

        if (error) {
            handler.reject(new BridgeError({ code: 'HOST_ERROR', message: error }));
        } else {
            handler.resolve(response);
        }
    }

    private static async sendNative<T>(
        call: NativeBridgeCall,
        type: string,
        payload: unknown,
        expectResponse: boolean
    ): Promise<T> {
        const reply = call({ v: 2, type, payload });
        if (!expectResponse) {
            // Notifications still reach the host; its acknowledgement is
            // irrelevant to the sender. Callers declared T but promised not
            // to read it.
            reply.catch(() => {});
            return undefined as T;
        }
        const response = await reply;
        const details = readBridgeError(response);
        if (details) throw new BridgeError(details);
        return response as T;
    }

    private static sendLegacy<T>(
        type: string,
        payload: unknown,
        expectResponse: boolean
    ): Promise<T> {
        const id = (this.requestIdCounter++).toString();
        const message: BridgeMessage = { type, id, payload };

        if (!expectResponse) {
            this.postMessage(message);
            return Promise.resolve(undefined as T);
        }

        // Executor form rather than Promise.withResolvers: this path also runs
        // on flutter_js QuickJS builds that predate ES2024.
        return new Promise<T>((resolve, reject) => {
            this.pendingRequests.set(id, {
                // Unvalidated host reply: T is the caller's declared
                // expectation of host data.
                resolve: (value) => resolve(value as T),
                reject,
            });
            this.postMessage(message);
        });
    }

    private static postMessage(message: BridgeMessage) {
        // flutter_js-era hosts inject a global `sendMessage`.
        if (typeof sendMessage === 'function') {
            sendMessage('synapse', JSON.stringify(message));
        } else {
            console.warn('[SynapseBridge] Mock send:', message);
        }
    }
}
