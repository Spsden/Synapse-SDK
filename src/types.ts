export type SynapseIntent = string;
export type SynapseParams = Record<string, any>;

export type IntentHandler = (params: SynapseParams) => Promise<SynapseResult>;

export interface SynapseResult {
    status: 'success' | 'fail';
    data?: any;
    error?: string;
    link?: string;
}

export interface NetworkRequest {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: any;
}

export interface NetworkResponse {
    status: number;
    data: any;
    headers: Record<string, string>;
}

// Internal bridge messages
export interface BridgeMessage {
    type: string;
    id?: string;
    payload?: any;
}
