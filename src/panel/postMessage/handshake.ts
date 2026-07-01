/**
 * Onshape Element Tab postMessage handshake.
 *
 * On load, this module parses the iframe's OWN query params (documentId,
 * workspaceId, elementId, server, companyId, userId, clientId) -- these
 * identify the extension's own tab and are used ONLY for the postMessage
 * handshake, NEVER as "which document/tab to check" (RESEARCH Anti-Patterns:
 * Element Tab extensions receive no live "context changed" push message; the
 * live target document/workspace/element is re-derived at "check now" click
 * time via a backend API call, not read from these params -- see Plan 03).
 *
 * Security (threat T-01-04): the message listener rejects any event whose
 * origin does not exactly equal the `server` origin captured at load. A
 * postMessage payload is never treated as an authorization signal.
 */

export interface OwnTabIdentity {
  documentId: string | null;
  workspaceId: string | null;
  elementId: string | null;
  serverOrigin: string | null;
  companyId: string | null;
  userId: string | null;
  clientId: string | null;
}

export function parseOwnTabIdentity(search: string): OwnTabIdentity {
  const params = new URLSearchParams(search);
  const server = params.get("server");
  let serverOrigin: string | null = null;
  if (server) {
    try {
      serverOrigin = new URL(server).origin;
    } catch {
      serverOrigin = null;
    }
  }

  return {
    documentId: params.get("documentId"),
    workspaceId: params.get("workspaceId"),
    elementId: params.get("elementId"),
    serverOrigin,
    companyId: params.get("companyId"),
    userId: params.get("userId"),
    clientId: params.get("clientId"),
  };
}

type OnshapeMessageType = "show" | "hide" | "takeFocus";

interface OnshapeClientMessage {
  messageName?: OnshapeMessageType | string;
  [key: string]: unknown;
}

export interface HandshakeCallbacks {
  onShow?: () => void;
  onHide?: () => void;
  onTakeFocus?: () => void;
}

/**
 * Sends the applicationInit handshake to the Onshape parent frame and
 * registers an origin-validated listener for show/hide/takeFocus messages.
 *
 * Returns the parsed own-tab identity (for the postMessage handshake only)
 * and a teardown function.
 */
export function startHandshake(callbacks: HandshakeCallbacks = {}): {
  identity: OwnTabIdentity;
  teardown: () => void;
} {
  const identity = parseOwnTabIdentity(window.location.search);

  function onMessage(event: MessageEvent<OnshapeClientMessage>) {
    // Reject any message whose origin does not exactly match the captured
    // Onshape server origin (threat T-01-04: postMessage origin spoofing).
    if (!identity.serverOrigin || event.origin !== identity.serverOrigin) {
      return;
    }

    const messageName = event.data?.messageName;
    if (messageName === "show") {
      callbacks.onShow?.();
    } else if (messageName === "hide") {
      callbacks.onHide?.();
    } else if (messageName === "takeFocus") {
      callbacks.onTakeFocus?.();
    }
  }

  window.addEventListener("message", onMessage);

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ messageName: "applicationInit" }, identity.serverOrigin ?? "*");
  }

  return {
    identity,
    teardown: () => window.removeEventListener("message", onMessage),
  };
}
