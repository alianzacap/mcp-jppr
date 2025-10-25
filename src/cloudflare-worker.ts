import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hono } from 'hono';
import { createToolEntry } from '@alianzacap/mcp-framework';
import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

// Environment variables
interface Env {
  MCP_OBJECT: any; // DurableObjectNamespace
  OAUTH_KV: any; // KVNamespace
  COGNITO_CLIENT_ID: string;
  COGNITO_CLIENT_SECRET: string;
  COGNITO_AUTHORIZATION_ENDPOINT: string;
  COGNITO_TOKEN_ENDPOINT: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

// Props passed from OAuth flow to the agent
type Props = {
  email: string;
  name: string;
  sub: string;
};

/**
 * JPPR MCP Agent with OAuth context
 * 
 * Migrated to use OAuth for user authentication (framework v3.0.0+)
 */
export class JPPRMcpAgent extends McpAgent<any, Record<string, never>, Props> {
  server = new McpServer({
    name: 'mcp-jppr',
    version: '1.1.0'
  });

  async init() {
    // Register tools using framework pattern
    const tools = [
      createToolEntry(searchPropertiesDefinition, searchPropertiesHandler),
      createToolEntry(getPropertyDetailsDefinition, getPropertyDetailsHandler)
    ];
    
    for (const { definition, handler } of tools) {
      this.server.tool(
        definition.name,
        (definition.inputSchema as any)._def.shape(),
        async (args: any) => {
          const result = await handler(args);
          return {
            content: result.content.map((item: any) => ({
              type: item.type,
              text: item.text
            }))
          };
        }
      );
    }
  }
}

// Cognito OAuth handler
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

// Authorization endpoint - redirect to Cognito
app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }

  // Redirect to Cognito hosted UI
  const state = btoa(JSON.stringify(oauthReqInfo));
  const redirectUrl = `${c.env.COGNITO_AUTHORIZATION_ENDPOINT}?` +
    `client_id=${c.env.COGNITO_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(new URL('/callback', c.req.url).href)}&` +
    `response_type=code&` +
    `scope=openid+email+profile&` +
    `state=${state}`;
  
  return Response.redirect(redirectUrl);
});

// Callback endpoint - exchange code for token
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  
  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  // Parse the oauthReqInfo from state
  const oauthReqInfo = JSON.parse(atob(state)) as AuthRequest;
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid state", 400);
  }

  // Exchange code for token
  const tokenUrl = `${c.env.COGNITO_TOKEN_ENDPOINT}`;
  const credentials = btoa(`${c.env.COGNITO_CLIENT_ID}:${c.env.COGNITO_CLIENT_SECRET}`);
  
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/callback', c.req.url).href
    })
  });
  
  if (!tokenResponse.ok) {
    return c.text('Failed to exchange code for token', 500);
  }
  
  const { access_token, id_token } = await tokenResponse.json();
  
  if (!access_token || !id_token) {
    return c.text('Failed to get tokens', 500);
  }
  
  // Decode ID token to get user info
  const [, payload] = id_token.split('.');
  const userInfo = JSON.parse(atob(payload));
  
  // Complete OAuth flow
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    metadata: {
      label: userInfo.name || userInfo.email,
    },
    props: {
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      sub: userInfo.sub,
    } as Props,
    request: oauthReqInfo,
    scope: oauthReqInfo.scope,
    userId: userInfo.sub,
  });

  return Response.redirect(redirectTo);
});

const CognitoHandler = app;

// Use OAuthProvider for MCP OAuth server functionality
export default new OAuthProvider({
  apiHandler: JPPRMcpAgent.mount("/mcp") as any,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: CognitoHandler as any,
  tokenEndpoint: "/token",
});
