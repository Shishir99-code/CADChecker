import { Router } from "express";
import passport from "passport";

/**
 * Auth entry points:
 * - GET /auth/onshape          -- initiates the OAuth2 authorization-code
 *                                  flow (redirects to Onshape's authorize
 *                                  endpoint with CSRF state).
 * - GET /auth/onshape/callback -- Onshape redirects back here after the
 *                                  user authorizes (or denies) access.
 *
 * On success, passport-onshape's verify callback (passport-config.ts) has
 * already written accessToken/refreshToken onto req.session; this route
 * only ever sets the session cookie via Set-Cookie -- it never echoes the
 * tokens themselves in any response body (threat T-01-03).
 */
export const authRouter: Router = Router();

authRouter.get("/auth/onshape", passport.authenticate("onshape"));

authRouter.get(
  "/auth/onshape/callback",
  (req, res, next) => {
    passport.authenticate("onshape", (err: unknown, user: Express.User | false) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        // Authorization failed or was denied -- redirect back to the panel
        // with a generic error indicator, no sensitive detail leaked.
        return res.redirect("/?auth=error");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        return res.redirect("/?auth=success");
      });
    })(req, res, next);
  },
);
