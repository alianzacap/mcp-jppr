import { type McpServerConfig, createToolEntry } from '@alianzacap/mcp-framework';
import { McpDurableObject, type CloudflareEnv } from '@alianzacap/mcp-framework/cloudflare';
import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';

// Cloudflare Workers types
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

// JPPR MCP Durable Object Agent
export class JPPRMcpAgent extends McpDurableObject {
  async init() {
    // Optional: Initialize any state here
  }

  getServerConfig(): McpServerConfig {
    return {
      name: 'mcp-jppr-cloudflare',
      version: '1.0.0',
      tools: [
        createToolEntry(searchPropertiesDefinition, searchPropertiesHandler),
        createToolEntry(getPropertyDetailsDefinition, getPropertyDetailsHandler)
      ]
    };
  }
}

// Bearer token authentication function
function authenticateBearerToken(request: Request, env: CloudflareEnv): Response | null {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Missing Authorization header',
      },
      id: null,
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid Authorization header format. Expected "Bearer <token>"',
      },
      id: null,
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = parts[1];
  const expectedToken = env.MCP_BEARER_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid Bearer token',
      },
      id: null,
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null; // Authentication successful
}

// Cloudflare Worker default export
export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Health check endpoint (no authentication required)
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'mcp-jppr-cloudflare',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        tools: ['search_properties', 'get_property_details']
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      // Authenticate Bearer token
      const authError = authenticateBearerToken(request, env);
      if (authError) return authError;

      return JPPRMcpAgent.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
