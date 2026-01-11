import { Bridge } from './bridge';
import { IntentHandler, SynapseParams, SynapseResult, NetworkRequest, NetworkResponse } from './types';

export class Synapse {
    private handlers = new Map<string, IntentHandler>();

    /**
     * Registers a handler for a specific intent.
     * @param intent The intent name (e.g., "create_event")
     * @param handler The function to execute
     */
    register(intent: string, handler: IntentHandler) {
        this.handlers.set(intent, handler);
        // Notify host that this intent is active (optional, for debugging)
        Bridge.send('log', { message: `Registered intent: ${intent}` });
    }

    /**
     * Called by the Host to trigger a plugin action.
     * @param intent
     * @param params 
     */
    async _dispatch(intent: string, params: SynapseParams) {
        const handler = this.handlers.get(intent);
        if (!handler) {
            return this.fail({ reason: 'not_implemented', message: `No handler for intent: ${intent}` });
        }

        try {
            const result = await handler(params);
            // The handler returns a SynapseResult, we just pass it back
            Bridge.send('finished', result);
        } catch (e: any) {
            this.fail({ reason: 'execution_error', message: e.message || 'Unknown error' });
        }
    }

    /**
     * Network Namespace
     */
    net = {
        request: async (req: NetworkRequest): Promise<NetworkResponse> => {
            // Send to host and wait for response
            return Bridge.send('network_request', req, true);
        },
        get: (url: string, headers?: Record<string, string>) => {
            return this.net.request({ method: 'GET', url, headers });
        },
        post: (url: string, body: any, headers?: Record<string, string>) => {
            return this.net.request({ method: 'POST', url, headers, body });
        }
    };

    /**
     * Helpers to construct standard results
     */
    success(data: any = {}): SynapseResult {
        return { status: 'success', data, link: data.link };
    }

    fail(error: { reason: string; message: string; retryable?: boolean }): SynapseResult {
        Bridge.send('finished', { status: 'error', ...error });
        return { status: 'fail', error: error.message };
    }

    // Expose bridge internals for the host to call back
    _bridge = {
        resolve: (id: string, response: any, error?: string) => Bridge.handleResponse(id, response, error)
    };
}

// Export singleton
export const synapse = new Synapse();

// Expose on global window for direct access if needed
(globalThis as any).synapse = synapse;
