import { describe, it, expect, vi } from "vitest";
import { callWithRefresh, ReconnectRequiredError } from "./refresh.ts";
import type { RefreshableSession } from "./refresh.ts";

function fakeSession(overrides: Partial<RefreshableSession> = {}): RefreshableSession {
  return {
    accessToken: "initial-access-token",
    refreshToken: "initial-refresh-token",
    needsReconnect: false,
    ...overrides,
  };
}

describe("callWithRefresh", () => {
  it("does not refresh or retry when fn succeeds on the first try", async () => {
    const session = fakeSession();
    const refreshFn = vi.fn();
    const fn = vi.fn().mockResolvedValue("success-value");

    const result = await callWithRefresh(session, fn, refreshFn);

    expect(result).toBe("success-value");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refreshFn).not.toHaveBeenCalled();
    expect(session.needsReconnect).toBe(false);
  });

  it("retries exactly once after a 401, using the refreshed access token", async () => {
    const session = fakeSession();
    const unauthorizedError = Object.assign(new Error("Unauthorized"), { status: 401 });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce("success-after-refresh");

    const refreshFn = vi.fn().mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
    });

    const result = await callWithRefresh(session, fn, refreshFn);

    expect(result).toBe("success-after-refresh");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(session.accessToken).toBe("new-access-token");
    expect(session.refreshToken).toBe("new-refresh-token");
    expect(session.needsReconnect).toBe(false);
  });

  it("sets needsReconnect=true and throws ReconnectRequiredError when the refresh call itself fails", async () => {
    const session = fakeSession();
    const unauthorizedError = Object.assign(new Error("Unauthorized"), { status: 401 });

    const fn = vi.fn().mockRejectedValue(unauthorizedError);
    const refreshFn = vi.fn().mockRejectedValue(new Error("invalid_grant"));

    await expect(callWithRefresh(session, fn, refreshFn)).rejects.toBeInstanceOf(ReconnectRequiredError);

    expect(session.needsReconnect).toBe(true);
    // fn was called once (the original attempt); refresh failed before any retry.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it("does not treat a non-401 error as a refresh trigger", async () => {
    const session = fakeSession();
    const otherError = new Error("Something else broke");

    const fn = vi.fn().mockRejectedValue(otherError);
    const refreshFn = vi.fn();

    await expect(callWithRefresh(session, fn, refreshFn)).rejects.toThrow("Something else broke");

    expect(refreshFn).not.toHaveBeenCalled();
    expect(session.needsReconnect).toBe(false);
  });
});
