import createClient from "openapi-fetch";
import type { paths, components } from "./types/onshape.d.ts";
import { callWithRefresh, type RefreshableSession, type RefreshedTokens } from "../auth/refresh.ts";

const ONSHAPE_API_BASE_URL = "https://cad.onshape.com";
const ONSHAPE_TOKEN_URL = "https://oauth.onshape.com/oauth/token";

export type ElementSummary = components["schemas"]["BTDocumentElementInfo"];
export type AssemblyDefinitionResponse = components["schemas"]["BTAssemblyDefinitionInfo"];

/** Thrown when an Onshape API call itself returns a non-2xx status (surfaced
 * to callWithRefresh via a `status` field so it can recognize 401s). */
export class OnshapeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OnshapeApiError";
    this.status = status;
  }
}

interface OnshapeClientEnv {
  clientID: string;
  clientSecret: string;
}

/**
 * Builds an openapi-fetch client with the session's access token attached via
 * an onRequest middleware hook. The token is injected server-side ONLY --
 * this client is never constructed in panel/browser code (threat T-01-10).
 */
function buildFetchClient(session: RefreshableSession) {
  const client = createClient<paths>({ baseUrl: ONSHAPE_API_BASE_URL });

  client.use({
    onRequest({ request }) {
      request.headers.set("Authorization", `Bearer ${session.accessToken ?? ""}`);
      request.headers.set("Accept", "application/json");
      return request;
    },
  });

  return client;
}

/** Performs the `grant_type=refresh_token` POST against Onshape's token
 * endpoint (RESEARCH Pattern 3). Any non-2xx or network failure here is
 * caught by callWithRefresh and treated uniformly as "needs reconnect". */
async function refreshOnshapeToken(
  env: OnshapeClientEnv,
  refreshToken: string | undefined,
): Promise<RefreshedTokens> {
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const res = await fetch(ONSHAPE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.clientID,
      client_secret: env.clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Onshape token refresh failed with status ${res.status}`);
  }

  return (await res.json()) as RefreshedTokens;
}

/**
 * Typed, session-scoped Onshape API client. Every method routes through
 * callWithRefresh so a 401 triggers exactly one transparent refresh+retry
 * (D-04); a refresh failure throws ReconnectRequiredError (D-05).
 */
export interface OnshapeClient {
  getElementsInDocument(documentId: string, workspaceId: string): Promise<ElementSummary[]>;
  getAssemblyDefinition(
    documentId: string,
    wvm: string,
    wvmid: string,
    elementId: string,
  ): Promise<AssemblyDefinitionResponse>;
}

export function createOnshapeClient(session: RefreshableSession, env: OnshapeClientEnv): OnshapeClient {
  const refreshFn = (refreshToken: string | undefined) => refreshOnshapeToken(env, refreshToken);

  return {
    async getElementsInDocument(documentId, workspaceId) {
      return callWithRefresh(
        session,
        async () => {
          const client = buildFetchClient(session);
          const result = await client.GET("/api/documents/d/{did}/{wvm}/{wvmid}/elements", {
            params: { path: { did: documentId, wvm: "w", wvmid: workspaceId } },
          });
          // This operation's OpenAPI spec declares only a `200` response (no
          // declared error statuses), so openapi-fetch's generated types
          // narrow `data`/`error` to `never` on the error branch -- but at
          // RUNTIME a non-2xx response still resolves as { error, response }
          // rather than throwing (openapi-fetch never throws on HTTP status).
          // Read `response.status` off the untyped result to preserve the
          // real status code for callWithRefresh's isUnauthorized() check.
          if (!result.data) {
            const status = (result as { response: Response }).response.status;
            throw new OnshapeApiError(status, "Failed to fetch elements in document");
          }
          return result.data;
        },
        refreshFn,
      );
    },

    async getAssemblyDefinition(documentId, wvm, wvmid, elementId) {
      return callWithRefresh(
        session,
        async () => {
          // getAssemblyDefinition's OpenAPI spec declares only a `default`
          // response (not an explicit 200), so openapi-fetch's success-type
          // narrowing (which only recognizes 2xx status keys) can't type
          // `client.GET(...)`'s data as non-`never` here. Call fetch directly
          // and cast through the generated schema type instead -- the schema
          // itself (BTAssemblyDefinitionInfo) is still the authoritative,
          // generated-from-spec type.
          const url = new URL(
            `/api/assemblies/d/${documentId}/${wvm}/${wvmid}/e/${elementId}`,
            ONSHAPE_API_BASE_URL,
          );
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${session.accessToken ?? ""}`,
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            throw new OnshapeApiError(res.status, "Failed to fetch assembly definition");
          }
          return (await res.json()) as AssemblyDefinitionResponse;
        },
        refreshFn,
      );
    },
  };
}
