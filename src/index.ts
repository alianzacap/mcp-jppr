import { 
  createMcpServer, 
  createToolEntry, 
  type McpServerConfig 
} from '@alianzacap/mcp-framework';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';

// Create MCP server configuration
export const serverConfig: McpServerConfig = {
  name: 'mcp-jppr',
  version: '1.0.0',
  tools: [
    createToolEntry(searchPropertiesDefinition, searchPropertiesHandler),
    createToolEntry(getPropertyDetailsDefinition, getPropertyDetailsHandler)
  ]
};

// Create and export the MCP server
export const server: McpServer = createMcpServer(serverConfig);

// Default export for compatibility
export default server; 