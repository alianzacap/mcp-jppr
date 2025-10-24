import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createToolEntry } from '@alianzacap/mcp-framework';
import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';

/**
 * JPPR MCP Agent for Cloudflare Workers
 * 
 * Migrated to use native Agents SDK pattern (framework v3.0.0+)
 */
export class JPPRMcpAgent extends McpAgent {
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

/**
 * Cloudflare Worker default export
 * 
 * Native Agents SDK pattern with simple bearer auth (framework v3.0.0+)
 */
export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    
    // Health check (no auth)
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'mcp-jppr',
        version: '1.1.0',
        tools: ['search_properties', 'get_property_details'],
        description: 'Puerto Rico property and GIS data MCP server'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // MCP endpoint with bearer auth
    if (url.pathname === '/mcp') {
      const auth = request.headers.get('authorization');
      if (!auth?.startsWith('Bearer ') || auth.split(' ')[1] !== env.MCP_BEARER_TOKEN) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Invalid Bearer token' },
          id: null
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return JPPRMcpAgent.serve('/mcp').fetch(request, env, undefined);
    }
    
    return new Response('Not found', { status: 404 });
  }
};
