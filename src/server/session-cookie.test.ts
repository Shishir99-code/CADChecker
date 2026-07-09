import { describe, it, expect } from "vitest";
import { deriveSessionCookieOptions } from "./session-cookie.ts";

describe("deriveSessionCookieOptions", () => {
  it("keeps secure+SameSite=None for an https redirect URI (iframe/prod)", () => {
    expect(deriveSessionCookieOptions("https://foo.example/auth/onshape/callback")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
  });

  it("relaxes to not-secure+Lax for an http://localhost redirect URI (local dev)", () => {
    expect(deriveSessionCookieOptions("http://localhost:5173/auth/onshape/callback")).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });

  it("defaults to the relaxed http variant when redirectUri is undefined", () => {
    expect(deriveSessionCookieOptions(undefined)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });
});
