import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Octokit } from 'octokit';
import { createToolEntry } from '@alianzacap/mcp-framework';
import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';

// Props passed from OAuth flow to the agent
type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
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

// OAuth handler for GitHub
async function handleGitHubOAuth(request: Request, env: any) {
  const url = new URL(request.url);
  
  // Authorization endpoint - redirect to GitHub
  if (url.pathname === '/authorize') {
    const state = btoa(JSON.stringify({ timestamp: Date.now() }));
    const redirectUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${env.GITHUB_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(new URL('/callback', request.url).href)}&` +
      `scope=read:user&` +
      `state=${state}`;
    return Response.redirect(redirectUrl);
  }
  
  // Callback endpoint - exchange code for token
  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      return new Response('Missing code', { status: 400 });
    }
    
    // Exchange code for token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    });
    
    const { access_token } = await tokenResponse.json();
    
    if (!access_token) {
      return new Response('Failed to get access token', { status: 500 });
    }
    
    // Get user info from GitHub
    const octokit = new Octokit({ auth: access_token });
    const user = await octokit.rest.users.getAuthenticated();
    
    // Store user info and complete OAuth flow
    // This is simplified - full implementation would use OAuthProvider.completeAuthorization
    return new Response(
      `OAuth success! User: ${user.data.login}. OAuthProvider integration needed for full flow.`,
      { status: 200 }
    );
  }
  
  return new Response('Not found', { status: 404 });
}

// Use OAuthProvider for MCP OAuth server functionality
export default new OAuthProvider({
  apiHandler: JPPRMcpAgent.mount("/mcp") as any,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: handleGitHubOAuth as any,
  tokenEndpoint: "/token",
});
