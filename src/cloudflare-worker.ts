import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type McpServerConfig } from '@angusdavis2/mcp-framework';
import {
  searchPropertiesDefinition,
  searchPropertiesHandler,
  getPropertyDetailsDefinition,
  getPropertyDetailsHandler
} from './jppr-tools.js';
import { createToolEntry } from '@angusdavis2/mcp-framework';

// Import the Cloudflare adapter functions from the main framework
import { 
  registerFrameworkTools, 
  createCloudflareWorkerApp,
  type CloudflareEnv,
  type CloudflareWorkerProps 
} from '@angusdavis2/mcp-framework';

// Reuse the same server configuration as the main mcp-jppr project
const serverConfig: McpServerConfig = {
  name: 'mcp-jppr-cloudflare',
  version: '1.0.0',
  tools: [
    createToolEntry(searchPropertiesDefinition, searchPropertiesHandler),
    createToolEntry(getPropertyDetailsDefinition, getPropertyDetailsHandler)
  ]
};

// Create MCP Agent class for JPPR tools
class JPPRMcpAgent extends McpAgent<CloudflareEnv, null, CloudflareWorkerProps> {
  server = new McpServer({
    name: serverConfig.name,
    version: serverConfig.version,
  });

  async init() {
    // Register all JPPR framework tools
    registerFrameworkTools(this.server, serverConfig);
    
    // Optional: Add worker-specific tools
    this.server.tool(
      "worker_info",
      {},
      async () => ({
        content: [
          {
            type: "text",
            text: `JPPR MCP Server running on Cloudflare Workers\nTools: search_properties, get_property_details`,
          },
        ],
      })
    );
  }
}

// Create the Cloudflare Worker app with authentication
const app: any = createCloudflareWorkerApp(JPPRMcpAgent, {
  serviceName: 'mcp-jppr-cloudflare',
  version: '1.0.0',
  requireAuth: true,
  healthEndpoint: '/health',
  mcpEndpoint: '/sse'
});

// Export for Cloudflare Workers
export default app;
export { JPPRMcpAgent }; 