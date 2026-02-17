import "dotenv/config";

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export interface AppConfig {
  port: number;
  sessionSecret: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  frontendUrl: string;
  redisUrl?: string;
  scopes: string[];
}

export const config: AppConfig = {
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
  sessionSecret: required("SESSION_SECRET"),
  clientId: required("WEBFLOW_CLIENT_ID"),
  clientSecret: required("WEBFLOW_CLIENT_SECRET"),
  redirectUri: required("WEBFLOW_REDIRECT_URI"),
  frontendUrl: required("FRONTEND_URL"),
  redisUrl: process.env.REDIS_URL,
  scopes: (process.env.WEBFLOW_SCOPES ??
    "sites:read,authorized_user:read,assets:read,assets:write")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean),
};
