import { type McpServerConfig, createToolEntry } from '@alianzacap/mcp-framework';
import { McpDurableObject, createWorkerFetchHandler } from '@alianzacap/mcp-framework/cloudflare';
import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';

/**
 * JPPR MCP Agent for Cloudflare Workers
 * 
 * This Durable Object provides MCP server functionality for Puerto Rico property data.
 * It uses the framework's authentication and routing capabilities.
 */
export class JPPRMcpAgent extends McpDurableObject {
  async init() {
    // Optional: Initialize any state here
  }

  getServerConfig(): McpServerConfig {
    return {
      name: 'mcp-jppr',
      version: '1.1.0',
      tools: [
        createToolEntry(searchPropertiesDefinition, searchPropertiesHandler),
        createToolEntry(getPropertyDetailsDefinition, getPropertyDetailsHandler)
      ]
    };
  }
}

/**
 * Cloudflare Worker default export
 * 
 * Uses the framework's createWorkerFetchHandler to provide:
 * - Health check endpoint at /health
 * - MCP protocol endpoint at /mcp (with Bearer authentication)
 */
const handler = createWorkerFetchHandler({
  durableObjectClass: JPPRMcpAgent,
  serviceName: 'mcp-jppr',
  version: '1.1.0',
  healthInfo: {
    tools: ['search_properties', 'get_property_details'],
    description: 'Puerto Rico property and GIS data MCP server'
  },
  requireAuth: true
});

export default handler;
