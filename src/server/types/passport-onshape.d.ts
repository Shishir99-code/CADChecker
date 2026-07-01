/**
 * Minimal ambient type declaration for `passport-onshape` (1.2.x).
 *
 * No official @types package exists for this niche, purpose-built Strategy
 * (RESEARCH Standard Stack / CLAUDE.md). This declares only the surface
 * CADChecker actually uses: the Strategy constructor and its verify-callback
 * shape when `passReqToCallback: true` is set.
 */
declare module "passport-onshape" {
  import type { Request } from "express";
  import type passport from "passport";

  export interface OnshapeProfile {
    provider: "onshape";
    id: string;
    displayName?: string;
    profileUrl?: string;
    emails?: Array<{ value: string }>;
    _raw: string;
    _json: unknown;
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    authorizationURL?: string;
    tokenURL?: string;
    userProfileURL?: string;
    state?: boolean;
    passReqToCallback?: true;
  }

  export type VerifyCallback = (error: unknown, user?: unknown, info?: unknown) => void;

  export type VerifyFunctionWithRequest = (
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: OnshapeProfile,
    done: VerifyCallback,
  ) => void;

  export class Strategy implements passport.Strategy {
    name: string;
    constructor(options: StrategyOptions, verify: VerifyFunctionWithRequest);
    authenticate(req: Request, options?: object): void;
  }
}
