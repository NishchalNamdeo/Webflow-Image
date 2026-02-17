import "express-session";

declare module "express-session" {
  interface SessionData {
    accessToken?: string;
    scopes?: string;

    postAuthRedirect?: string;

    authorizedSites?: Record<
      string,
      {
        siteId: string;
        siteName?: string;
        accessToken?: string;
        scopes?: string;
        firstSeenAt: number;
        lastSeenAt: number;
      }
    >;
  }
}
