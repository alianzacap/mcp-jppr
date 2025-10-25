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
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  AUTH0_AUDIENCE: string;
  AUTH0_SCOPE: string;
  NODE_ENV: string;
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

// Health check endpoint (no auth required)
app.get("/health", async (c) => {
  return c.json({
    status: 'healthy',
    service: 'mcp-jppr',
    version: '1.1.0',
    auth: 'oauth',
    endpoints: ['/mcp', '/authorize', '/callback', '/register', '/token']
  });
});

// Authorization endpoint - redirect to Auth0
app.get("/authorize", async (c) => {
  try {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    const { clientId } = oauthReqInfo;
    if (!clientId) {
      console.error("Authorization failed: Missing clientId in OAuth request");
      return c.text("Invalid request: Missing client_id", 400);
    }

    // Redirect to Auth0 hosted UI
    const state = btoa(JSON.stringify(oauthReqInfo));
    const callbackUrl = new URL('/callback', c.req.url).href;
    const redirectUrl = `https://${c.env.AUTH0_DOMAIN}/authorize?` +
      `client_id=${c.env.AUTH0_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(c.env.AUTH0_SCOPE)}&` +
      `audience=${encodeURIComponent(c.env.AUTH0_AUDIENCE)}&` +
      `state=${state}`;
    
    console.log("Authorization request:", {
      mcp_client_id: clientId,
      auth0_client_id: c.env.AUTH0_CLIENT_ID,
      callback_url: callbackUrl,
      redirect_url: redirectUrl.substring(0, 150) + "..." // Truncate for logging
    });
    
    return Response.redirect(redirectUrl);
  } catch (error) {
    console.error("Authorization endpoint error:", error);
    return c.text(`Authorization error: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
});

// Callback endpoint - exchange code for token
app.get("/callback", async (c) => {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");
    
    // Check for Auth0 error response
    if (error) {
      console.error("Auth0 returned error:", {
        error,
        error_description: errorDescription,
        full_url: c.req.url
      });
      return c.text(`Auth0 authentication error: ${error} - ${errorDescription || 'No description'}`, 400);
    }
    
    if (!code || !state) {
      console.error("Callback missing required parameters:", { code: !!code, state: !!state });
      return c.text("Missing code or state parameter", 400);
    }

    // Parse the oauthReqInfo from state
    let oauthReqInfo: AuthRequest;
    try {
      oauthReqInfo = JSON.parse(atob(state)) as AuthRequest;
    } catch (e) {
      console.error("Failed to parse state parameter:", e);
      return c.text("Invalid state parameter", 400);
    }
    
    if (!oauthReqInfo.clientId) {
      console.error("State missing clientId:", oauthReqInfo);
      return c.text("Invalid state: missing clientId", 400);
    }

    // Exchange code for token with Auth0
    const tokenUrl = `https://${c.env.AUTH0_DOMAIN}/oauth/token`;
    const callbackUrl = new URL('/callback', c.req.url).href;
    
    console.log("Exchanging authorization code for tokens:", {
      token_url: tokenUrl,
      callback_url: callbackUrl,
      code_length: code.length,
      has_client_secret: !!c.env.AUTH0_CLIENT_SECRET
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: c.env.AUTH0_CLIENT_ID,
        client_secret: c.env.AUTH0_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl
      })
    });
    
    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token exchange failed:", {
        status: tokenResponse.status,
        status_text: tokenResponse.statusText,
        error_body: errorBody
      });
      return c.text(`Failed to exchange code for token: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorBody}`, 500);
    }
    
    const tokenData = await tokenResponse.json();
    const { access_token, id_token } = tokenData;
    
    if (!access_token || !id_token) {
      console.error("Token response missing required tokens:", {
        has_access_token: !!access_token,
        has_id_token: !!id_token,
        response_keys: Object.keys(tokenData)
      });
      return c.text('Token response missing access_token or id_token', 500);
    }
    
    // Decode ID token to get user info
    const [, payload] = id_token.split('.');
    const userInfo = JSON.parse(atob(payload));
    
    console.log("Successfully authenticated user:", {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name
    });
    
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

    console.log("OAuth flow completed, redirecting to:", redirectTo);
    return Response.redirect(redirectTo);
  } catch (error) {
    console.error("Callback endpoint error:", error);
    return c.text(`Callback error: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
  }
});

const Auth0Handler = app;

// Use OAuthProvider for MCP OAuth server functionality
// The OAuth provider automatically uses the OAUTH_KV binding from the environment
// Auth0 acts as the OIDC identity provider
export default new OAuthProvider({
  apiHandler: JPPRMcpAgent.mount("/mcp") as any,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: Auth0Handler as any,
  tokenEndpoint: "/token",
});
