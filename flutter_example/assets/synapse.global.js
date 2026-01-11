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
  var Synapse = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
      /**
       * Network Namespace
       */
      this.net = {
        request: async (req) => {
          return Bridge.send("network_request", req, true);
        },
        get: (url, headers) => {
          return this.net.request({ method: "GET", url, headers });
        },
        post: (url, body, headers) => {
          return this.net.request({ method: "POST", url, headers, body });
        }
      };
      // Expose bridge internals for the host to call back
      this._bridge = {
        resolve: (id, response, error) => Bridge.handleResponse(id, response, error)
      };
    }
    /**
     * Registers a handler for a specific intent.
     * @param intent The intent name (e.g., "create_event")
     * @param handler The function to execute
     */
    register(intent, handler) {
      this.handlers.set(intent, handler);
      Bridge.send("log", { message: `Registered intent: ${intent}` });
    }
    /**
     * Called by the Host to trigger a plugin action.
     * @param intent
     * @param params 
     */
    async _dispatch(intent, params) {
      const handler = this.handlers.get(intent);
      if (!handler) {
        return this.fail({ reason: "not_implemented", message: `No handler for intent: ${intent}` });
      }
      try {
        const result = await handler(params);
        Bridge.send("finished", result);
      } catch (e) {
        this.fail({ reason: "execution_error", message: e.message || "Unknown error" });
      }
    }
    /**
     * Helpers to construct standard results
     */
    success(data = {}) {
      return { status: "success", data, link: data.link };
    }
    fail(error) {
      Bridge.send("finished", { status: "error", ...error });
      return { status: "fail", error: error.message };
    }
  };
  var synapse = new Synapse();
  globalThis.synapse = synapse;
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=index.global.js.map