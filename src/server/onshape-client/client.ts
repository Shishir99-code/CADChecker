import createClient from "openapi-fetch";
import type { paths, components } from "./types/onshape.d.ts";
import { callWithRefresh, type RefreshableSession, type RefreshedTokens } from "../auth/refresh.ts";

const ONSHAPE_API_BASE_URL = "https://cad.onshape.com";
const ONSHAPE_TOKEN_URL = "https://oauth.onshape.com/oauth/token";

export type ElementSummary = components["schemas"]["BTDocumentElementInfo"];
export type AssemblyDefinitionResponse = components["schemas"]["BTAssemblyDefinitionInfo"];
export type MassPropertiesBulkResponse = components["schemas"]["BTMassPropertiesBulkInfo"];
export type PartMetadata = components["schemas"]["BTPartMetadataInfo"];
export type BoundingBoxResponse = components["schemas"]["BTBoundingBoxInfo"];
export type DocumentInfo = components["schemas"]["BTDocumentInfo"];

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

export interface OnshapeClientEnv {
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
  getPartStudioMassProperties(
    documentId: string,
    wvm: string,
    wvmid: string,
    elementId: string,
    partIds?: string[],
    configuration?: string,
  ): Promise<MassPropertiesBulkResponse>;
  getPartsMetadata(
    documentId: string,
    wvm: string,
    wvmid: string,
    elementId: string,
  ): Promise<PartMetadata[]>;
  getBoundingBoxes(
    documentId: string,
    wvm: string,
    wvmid: string,
    elementId: string,
    partId: string,
    configuration?: string,
  ): Promise<BoundingBoxResponse>;
  getAssemblyBoundingBoxes(
    documentId: string,
    wvm: string,
    wvmid: string,
    elementId: string,
  ): Promise<BoundingBoxResponse>;
  getDocument(documentId: string): Promise<DocumentInfo>;
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

    async getPartStudioMassProperties(documentId, wvm, wvmid, elementId, partIds, configuration) {
      return callWithRefresh(
        session,
        async () => {
          // Like getAssemblyDefinition, the massproperties operation declares
          // only a `default` response in the OpenAPI spec, so openapi-fetch's
          // typed .GET() narrows `data` to `never`. Use raw fetch + cast
          // through the generated BTMassPropertiesBulkInfo schema instead.
          const url = new URL(
            `/api/partstudios/d/${documentId}/${wvm}/${wvmid}/e/${elementId}/massproperties`,
            ONSHAPE_API_BASE_URL,
          );
          // Filter to the specific parts we care about (bulk call per Part
          // Studio element, avoiding the O(N)-per-part chatty anti-pattern).
          for (const id of partIds ?? []) url.searchParams.append("partId", id);
          // RESEARCH Pitfall 3: thread configuration through so mass properties
          // reflect the specific configured variant, not the default.
          if (configuration) url.searchParams.set("configuration", configuration);
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${session.accessToken ?? ""}`,
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            throw new OnshapeApiError(res.status, "Failed to fetch part studio mass properties");
          }
          return (await res.json()) as MassPropertiesBulkResponse;
        },
        refreshFn,
      );
    },

    async getPartsMetadata(documentId, wvm, wvmid, elementId) {
      return callWithRefresh(
        session,
        async () => {
          // Parts-metadata list operation also declares only a `default`
          // response; same raw-fetch-then-cast idiom as above.
          const url = new URL(
            `/api/parts/d/${documentId}/${wvm}/${wvmid}/e/${elementId}`,
            ONSHAPE_API_BASE_URL,
          );
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${session.accessToken ?? ""}`,
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            throw new OnshapeApiError(res.status, "Failed to fetch parts metadata");
          }
          return (await res.json()) as PartMetadata[];
        },
        refreshFn,
      );
    },

    async getBoundingBoxes(documentId, wvm, wvmid, elementId, partId, configuration) {
      return callWithRefresh(
        session,
        async () => {
          // Like getAssemblyDefinition/getPartStudioMassProperties, this
          // operation declares only a `default` response in the OpenAPI spec,
          // so openapi-fetch's typed .GET() narrows `data` to `never`. Use
          // raw fetch + cast through the generated BTBoundingBoxInfo schema.
          //
          // RESEARCH Assumption A1 (03-RESEARCH.md): this per-part endpoint is
          // inferred to return corners in the Part Studio's LOCAL coordinate
          // system, requiring Fact.transform to reach world space -- VERIFY
          // against 03-BOUNDING-BOX-CONTRACT.md before trusting in check code.
          const url = new URL(
            `/api/parts/d/${documentId}/${wvm}/${wvmid}/e/${elementId}/partid/${partId}/boundingboxes`,
            ONSHAPE_API_BASE_URL,
          );
          if (configuration) url.searchParams.set("configuration", configuration);
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${session.accessToken ?? ""}`,
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            throw new OnshapeApiError(res.status, "Failed to fetch part bounding box");
          }
          return (await res.json()) as BoundingBoxResponse;
        },
        refreshFn,
      );
    },

    async getAssemblyBoundingBoxes(documentId, wvm, wvmid, elementId) {
      return callWithRefresh(
        session,
        async () => {
          // Same raw-fetch-then-cast idiom as the other methods in this file.
          //
          // RESEARCH Assumption A2 (03-RESEARCH.md): this assembly-level
          // endpoint is inferred to already be in world space (the assembly
          // IS the top-level/world coordinate frame) -- no transform needed.
          // VERIFY against 03-BOUNDING-BOX-CONTRACT.md before trusting in
          // check code.
          const url = new URL(
            `/api/assemblies/d/${documentId}/${wvm}/${wvmid}/e/${elementId}/boundingboxes`,
            ONSHAPE_API_BASE_URL,
          );
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${session.accessToken ?? ""}`,
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            throw new OnshapeApiError(res.status, "Failed to fetch assembly bounding box");
          }
          return (await res.json()) as BoundingBoxResponse;
        },
        refreshFn,
      );
    },

    async getDocument(documentId) {
      return callWithRefresh(
        session,
        async () => {
          const client = buildFetchClient(session);
          const result = await client.GET("/api/documents/{did}", {
            params: { path: { did: documentId } },
          });
          if (!result.data) {
            const status = (result as { response: Response }).response.status;
            throw new OnshapeApiError(status, "Failed to fetch document");
          }
          return result.data;
        },
        refreshFn,
      );
    },
  };
}
