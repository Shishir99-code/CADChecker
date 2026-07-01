import type { PassportStatic } from "passport";
import { Strategy as OnshapeStrategy, type OnshapeProfile } from "passport-onshape";

/**
 * Minimal user shape passport serializes into/deserializes out of the
 * session. CADChecker has no user datastore (v1 constraint) -- the only
 * thing that matters is the Onshape profile id, which passport requires as
 * a serializable "user" object. The actual OAuth tokens are written directly
 * onto req.session in the verify callback (see below), never through this
 * serialize/deserialize path, and never emitted in any response body.
 */
export interface SessionUser {
  id: string;
  displayName?: string;
}

export interface OnshapeOAuthEnv {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
}

/**
 * Configures passport with the Onshape OAuth2 Strategy.
 *
 * - `state: true` enables passport-oauth2's session-backed CSRF state store
 *   (NonceStore) -- REQUIRED, never disable (RESEARCH Known Threat Patterns,
 *   threat T-01-01).
 * - `passReqToCallback: true` gives the verify callback access to `req`, so
 *   accessToken/refreshToken can be written directly onto `req.session`
 *   (D-03) rather than passed through passport's serialized "user" object,
 *   which keeps tokens out of anything passport might persist/log.
 */
export function configureOnshapeStrategy(passportInstance: PassportStatic, env: OnshapeOAuthEnv): void {
  passportInstance.use(
    new OnshapeStrategy(
      {
        clientID: env.clientID,
        clientSecret: env.clientSecret,
        callbackURL: env.callbackURL,
        state: true,
        passReqToCallback: true,
      },
      (req, accessToken, refreshToken, profile: OnshapeProfile, done) => {
        // Tokens are stored ONLY on the server-side session -- never on the
        // `user` object passport serializes, never in any response body
        // (threat T-01-03).
        req.session.accessToken = accessToken;
        req.session.refreshToken = refreshToken;
        req.session.needsReconnect = false;

        const user: SessionUser = { id: profile.id, displayName: profile.displayName };
        done(null, user);
      },
    ),
  );

  passportInstance.serializeUser((user, done) => {
    done(null, user as SessionUser);
  });

  passportInstance.deserializeUser((user, done) => {
    done(null, user as SessionUser);
  });
}
