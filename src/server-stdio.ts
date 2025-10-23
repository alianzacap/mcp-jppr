import { startStdioServer } from '@alianzacap/mcp-framework';
import { server } from './index.js';

console.error('🚀 Starting MCP JPPR Server (STDIO mode)');
console.error('📋 Available tools:');
console.error('   - search_properties: Search for properties by Catastro number or coordinates');
console.error('   - get_property_details: Get detailed information about a specific property by Catastro number');
console.error('');
console.error('💡 This server provides access to Puerto Rico property data via MIPR (Junta de Planificación)');
console.error('🔗 Real-time data from official government GIS services');
console.error('');

// Start the stdio server
startStdioServer(server); 