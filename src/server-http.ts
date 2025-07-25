import { startHttpServer, type HttpServerConfig } from '@angusdavis2/mcp-framework';
import { server } from './index.js';

// Configuration for HTTP server
const config: HttpServerConfig = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  bearerToken: process.env.BEARER_TOKEN || 'default-jppr-token-change-me',
  serviceName: 'MCP JPPR Server',
  version: '1.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

console.error('🚀 Starting MCP JPPR Server (HTTP mode)');
console.error('📋 Available tools:');
console.error('   - search_properties: Search for properties by Catastro number or coordinates');
console.error('   - get_property_details: Get detailed information about a specific property by Catastro number');
console.error('');
console.error('🌐 Server Configuration:');
console.error(`   Host: ${config.host}`);
console.error(`   Port: ${config.port}`);
console.error(`   Bearer Token: ${config.bearerToken.substring(0, 10)}...`);
console.error(`   CORS Origin: ${config.corsOrigin}`);
console.error('');
console.error('💡 This server provides access to Puerto Rico property data via MIPR (Junta de Planificación)');
console.error('🔐 Use Bearer token authentication for API access');
console.error('');

// Start the HTTP server
startHttpServer(server, config).catch((error) => {
  console.error('❌ Failed to start HTTP server:', error);
  process.exit(1);
}); 