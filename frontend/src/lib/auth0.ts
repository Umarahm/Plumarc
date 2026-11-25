import { Auth0Client } from "@auth0/nextjs-auth0/server";

// AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET and
// APP_BASE_URL are read from the environment by the SDK.
export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    // offline_access issues the refresh token that renews expired access tokens.
    scope: "openid profile email offline_access",
  },
  session: {
    rolling: true,
    inactivityDuration: 30 * 60,
    absoluteDuration: 8 * 60 * 60,
  },
  tokenRefreshBuffer: 60,
  // Tokens stay on the server; the browser only holds the encrypted session cookie.
  enableAccessTokenEndpoint: false,
});
