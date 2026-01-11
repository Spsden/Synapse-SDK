import { BridgeMessage } from './types';

// Declare the function injected by flutter_js
declare global {
    function sendMessage(channel: string, message: string): void;
}

export class Bridge {
    private static pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
    private static requestIdCounter = 0;

    /**
     * Sends a message to the host (Flutter).
     * If `expectResponse` is true, returns a Promise that resolves when Host replies.
     */
    static send(type: string, payload: any = {}, expectResponse = false): Promise<any> {
        const id = (this.requestIdCounter++).toString();
        const message: BridgeMessage = { type, id, payload };

        // If we're just notifying (e.g. success/fail), fire and forget
        if (!expectResponse) {
            this._postMessage(message);
            return Promise.resolve();
        }

        // Otherwise, register the promise to wait for a reply
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this._postMessage(message);
        });
    }

    /**
     * Called by the Host to resolve a pending request.
     * e.g. synapse._bridge.resolve('123', { status: 200, data: ... })
     */
    static handleResponse(id: string, response: any, error?: string) {
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

    private static _postMessage(message: BridgeMessage) {
        // Check if running in flutter_js environment
        if (typeof sendMessage === 'function') {
            sendMessage('synapse', JSON.stringify(message));
        } else {
            console.warn('[SynapseBridge] Mock send:', message);
        }
    }
}
