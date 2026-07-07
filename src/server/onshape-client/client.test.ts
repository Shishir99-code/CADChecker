import { describe, it, expect, vi, afterEach } from "vitest";
import { createOnshapeClient, OnshapeApiError } from "./client.ts";
import type { OnshapeClientEnv, MassPropertiesBulkResponse } from "./client.ts";
import type { RefreshableSession } from "../auth/refresh.ts";

const ENV: OnshapeClientEnv = { clientID: "test-client-id", clientSecret: "test-client-secret" };

function fakeSession(overrides: Partial<RefreshableSession> = {}): RefreshableSession {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    needsReconnect: false,
    ...overrides,
  };
}

/** Builds a minimal Response-like object matching what the client reads
 * (res.ok, res.status, res.json()). */
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPartStudioMassProperties", () => {
  it("targets the massproperties path and appends one partId param per id", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse(200, { bodies: {} }));
    const client = createOnshapeClient(fakeSession(), ENV);

    await client.getPartStudioMassProperties("DID", "w", "WID", "EID", ["PART_A", "PART_B"]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = new URL((fetchSpy.mock.calls[0]![0] as URL).toString());
    expect(url.pathname).toBe("/api/partstudios/d/DID/w/WID/e/EID/massproperties");
    expect(url.searchParams.getAll("partId")).toEqual(["PART_A", "PART_B"]);
    expect(url.searchParams.has("configuration")).toBe(false);
  });

  it("sets a configuration query param only when provided", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse(200, { bodies: {} }));
    const client = createOnshapeClient(fakeSession(), ENV);

    await client.getPartStudioMassProperties("DID", "w", "WID", "EID", ["PART_A"], "CONFIG_X");

    const url = new URL((fetchSpy.mock.calls[0]![0] as URL).toString());
    expect(url.searchParams.get("configuration")).toBe("CONFIG_X");
  });

  it("throws OnshapeApiError carrying the response status on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(404, {}));
    const client = createOnshapeClient(fakeSession(), ENV);

    await expect(
      client.getPartStudioMassProperties("DID", "w", "WID", "EID", ["PART_A"]),
    ).rejects.toBeInstanceOf(OnshapeApiError);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(500, {}));
    const client2 = createOnshapeClient(fakeSession(), ENV);
    await expect(
      client2.getPartStudioMassProperties("DID", "w", "WID", "EID", ["PART_A"]),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("exposes mass[0] as the nominal kg for a BTMassPropertiesBulkInfo-shaped body", async () => {
    const fixture: MassPropertiesBulkResponse = {
      bodies: {
        PART_A: { mass: [1.5, 1.6, 1.4], hasMass: true, massMissingCount: 0 },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, fixture));
    const client = createOnshapeClient(fakeSession(), ENV);

    const result = await client.getPartStudioMassProperties("DID", "w", "WID", "EID", ["PART_A"]);

    expect(result.bodies?.["PART_A"]?.mass?.[0]).toBe(1.5);
    expect(result.bodies?.["PART_A"]?.hasMass).toBe(true);
  });
});

describe("getPartsMetadata", () => {
  it("targets the parts path and returns the parsed metadata array", async () => {
    const fixture = [
      { partId: "PART_A", material: { id: "1006", displayName: "Aluminum" } },
      { partId: "PART_B" }, // no material assigned -> unmaterialized
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, fixture));
    const client = createOnshapeClient(fakeSession(), ENV);

    const result = await client.getPartsMetadata("DID", "w", "WID", "EID");

    const url = new URL((fetchSpy.mock.calls[0]![0] as URL).toString());
    expect(url.pathname).toBe("/api/parts/d/DID/w/WID/e/EID");
    expect(result).toHaveLength(2);
    expect(result[0]?.material).toBeDefined();
    expect(result[1]?.material).toBeUndefined();
  });

  it("throws OnshapeApiError carrying the response status on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(403, {}));
    const client = createOnshapeClient(fakeSession(), ENV);

    await expect(client.getPartsMetadata("DID", "w", "WID", "EID")).rejects.toMatchObject({
      status: 403,
    });
  });
});
