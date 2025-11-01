# MCP JPPR Server

Model Context Protocol (MCP) server for accessing Puerto Rico property and GIS data through the Junta de Planificación de Puerto Rico (JPPR) APIs.

## Overview

This MCP server provides tools to interact with Puerto Rico's [MIPR (Mapa Interactivo de Puerto Rico)](https://gis.jp.pr.gov/mipr/index.html) system, allowing you to:

- Search for properties by address, parcel ID, municipality, or coordinates
- Get detailed property information including ownership, assessed values, and zoning
- List all Puerto Rico municipalities
- Find properties within geographic areas (bounding boxes)
- Convert between coordinate systems used in Puerto Rico

This server is built using the `@alianzacap/mcp-framework`, providing consistent functionality across stdio, DXT, and Cloudflare Worker deployments.

## Documentation

- **[docs/AUTH0_SETUP.md](./docs/AUTH0_SETUP.md)** - Auth0 OAuth configuration and deployment
- **[docs/MULTI_VALUE_FIELDS.md](./docs/MULTI_VALUE_FIELDS.md)** - Handling multi-value fields in JPPR data
- **[docs/ERROR_HANDLING_IMPROVEMENTS.md](./docs/ERROR_HANDLING_IMPROVEMENTS.md)** - Error handling patterns
- **[docs/TESTING_ANALYSIS.md](./docs/TESTING_ANALYSIS.md)** - Testing strategies and results

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Stdio Mode (Local Claude Desktop)

For local integration with Claude Desktop:

```bash
npm run start:stdio
```

### Cloudflare Worker (Production)

See **Cloudflare Worker Deployment** section below for Auth0 OAuth setup.

## Available Tools

### 1. `search_properties`

Search for properties using various criteria.

**Parameters:**
- `address` (optional): Property address to search for
- `parcelId` (optional): Property parcel identification number
- `municipality` (optional): Municipality name (e.g., "San Juan", "Bayamón")
- `latitude` (optional): Latitude coordinate for location-based search
- `longitude` (optional): Longitude coordinate for location-based search
- `limit` (optional): Maximum number of results (default: 10)

**Example:**
```json
{
  "address": "Calle Fortaleza, San Juan",
  "limit": 5
}
```

### 2. `get_property_details`

Get detailed information about a specific property.

**Parameters:**
- `parcelId`: Property parcel identification number

**Example:**
```json
{
  "parcelId": "091-065-487-77"
}
```

### 3. `get_municipalities`

Get a list of all municipalities in Puerto Rico.

**Parameters:** None

### 4. `get_properties_in_area`

Find properties within a geographic bounding box.

**Parameters:**
- `minLatitude`: Minimum latitude of the bounding box
- `minLongitude`: Minimum longitude of the bounding box
- `maxLatitude`: Maximum latitude of the bounding box
- `maxLongitude`: Maximum longitude of the bounding box
- `limit` (optional): Maximum number of properties to return (default: 20)

**Example:**
```json
{
  "minLatitude": 18.4000,
  "minLongitude": -66.2000,
  "maxLatitude": 18.5000,
  "maxLongitude": -66.1000,
  "limit": 10
}
```

### 5. `convert_coordinates`

Convert coordinates between different coordinate systems.

**Parameters:**
- `latitude`: Latitude coordinate to convert
- `longitude`: Longitude coordinate to convert
- `fromSystem` (optional): Source coordinate system ("WGS84", "NAD83", "StatePlane")
- `toSystem` (optional): Target coordinate system ("WGS84", "NAD83", "StatePlane")

**Example:**
```json
{
  "latitude": 18.4655,
  "longitude": -66.1057,
  "fromSystem": "WGS84",
  "toSystem": "StatePlane"
}
```

## Claude Desktop Integration

To use this server with Claude Desktop, add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jppr": {
      "command": "node",
      "args": ["/path/to/mcp-jppr/dist/server-stdio.js"],
      "env": {}
    }
  }
}
```

## Cloudflare Worker Deployment

### Authentication: Auth0 OAuth

The Cloudflare Worker deployment uses **Auth0 OAuth** for secure authentication. See **[docs/AUTH0_SETUP.md](./docs/AUTH0_SETUP.md)** for complete setup instructions.

**Quick Overview:**
- **Auth0 Domain**: dev-alianzacap.us.auth0.com
- **Application**: mcp-jppr
- **Secrets**: AWS Secrets Manager (`alianza/auth0-mcp-jppr-client`, `alianza/cloudflare-workers-token`)

### Deployment

**Automatic**: Every push to main deploys via GitHub Actions

**Manual**:
```bash
# 1. Sync secrets from AWS to Cloudflare (only needed when secrets change)
./scripts/sync-secrets-from-aws.sh

# 2. Build and deploy
npm run build
npx wrangler deploy
```

### Worker URL

Production: **https://mcp-jppr.alianza-capital.workers.dev**

**Endpoints:**
- `/health` - Health check (no authentication)
- `/mcp` - MCP protocol endpoint with **Streamable HTTP** transport (requires OAuth - for consumer apps)
- `/sse` - MCP protocol endpoint with **SSE** transport (legacy, requires OAuth - for consumer apps)
- `/mcp-m2m` - MCP protocol endpoint (requires JWT bearer token - for server apps)
- `/authorize` - OAuth authorization endpoint
- `/callback` - OAuth callback endpoint
- `/register` - OAuth client registration
- `/token` - OAuth token endpoint

**Transport Support:**
- **Streamable HTTP** (modern, recommended): Use `/mcp` endpoint
- **SSE** (legacy, stable): Use `/sse` endpoint

### Using with Claude Desktop

Configure Claude Desktop to use OAuth:

**Modern Streamable HTTP (recommended):**
```json
{
  "mcpServers": {
    "jppr": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-jppr.alianza-capital.workers.dev/mcp"
      ]
    }
  }
}
```

**Legacy SSE (if experiencing issues with streamable):**
```json
{
  "mcpServers": {
    "jppr": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-jppr.alianza-capital.workers.dev/sse"
      ]
    }
  }
}
```

Claude will open a browser for Auth0 login. Login with:
- Email: `test@alianzacap.com`
- Password: `TempPass123!`

### Server-to-Server (M2M) Authentication

For programmatic/server access, use the M2M endpoint with Auth0 Client Credentials:

```bash
# 1. Get access token from Auth0
TOKEN=$(curl -s -X POST https://dev-alianzacap.us.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_M2M_CLIENT_ID",
    "client_secret": "YOUR_M2M_CLIENT_SECRET",
    "audience": "urn:mcp-jppr",
    "grant_type": "client_credentials"
  }' | jq -r '.access_token')

# 2. Call MCP endpoint
curl -X POST https://mcp-jppr.alianza-capital.workers.dev/mcp-m2m \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_properties",
      "arguments": { "query": "San Juan" }
    },
    "id": 1
  }'
```

**M2M Application**: The Auth0 application for M2M connections is named **`mcp-jppr-m2m`**. To get credentials:
1. Navigate to Auth0 Dashboard → Applications
2. Find the **`mcp-jppr-m2m`** application
3. Copy Client ID and Client Secret

See [docs/AUTH0_SETUP.md](./docs/AUTH0_SETUP.md#machine-to-machine-m2m-authentication) for detailed instructions.

## Testing

### Comprehensive Property Testing

The repository includes a comprehensive test script that validates the server against 20 diverse Catastro numbers across Puerto Rico:

```bash
node test-catastros.js
```

**Test Coverage:**
- **14 municipalities**: From San Juan to rural mountain towns
- **6 zoning types**: Residential (R-I, R-G, R-3), Agricultural (A-G, A-P, AD), Tourism (LT-CR1)
- **Property sizes**: 233 sq m to 10,700 sq m (45x size variation)
- **Geographic diversity**: Coastal, urban, mountainous, and rural properties
- **Edge cases**: Inactive/empty property records

**Last Test Results**: 100% success rate (20/20 properties found)

The test script helps validate:
- API response consistency
- Catastro number format handling
- Geographic coverage
- Property type diversity
- Error handling

### Manual Testing

Test individual properties:

```bash
# Test by Catastro number
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_property_details", "arguments": {"parcelId": "091-065-487-77"}}}' | node dist/server-stdio.js

# Test by coordinates  
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "search_properties", "arguments": {"latitude": 18.4655, "longitude": -66.1057}}}' | node dist/server-stdio.js
```

## Data Sources

This server integrates with:
- **MIPR**: [Mapa Interactivo de Puerto Rico](https://gis.jp.pr.gov/mipr/index.html)
- **Junta de Planificación de Puerto Rico**: Official planning and zoning data

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Project Structure

```
src/
├── index.ts              # Main server entry point (stdio)
├── server-stdio.ts       # Stdio transport server
├── cloudflare-worker.ts  # Cloudflare Worker using framework
├── mipr-api-client.ts    # MIPR API client
└── jppr-tools.ts         # MCP tool definitions
```

### Framework Architecture

This server uses the `@alianzacap/mcp-framework` which provides:

- **Consistent Tool Definitions**: Tools are defined once and work across all deployment methods
- **Built-in Authentication**: Framework handles Bearer token authentication for Workers
- **Health Checks**: Automatic health check endpoints
- **Type Safety**: Full TypeScript support with Zod schema validation
- **Edge Deployment**: Optimized for Cloudflare Workers with Durable Objects

## Legal Notice

This software provides access to public data from the Junta de Planificación de Puerto Rico. The data is provided for reference purposes only and should not be construed as a legal document or survey instrument. Users assume all responsibility for the use of this information.

As stated on the MIPR website:
> "This product is for reference purposes only and is not to be construed as a legal document or survey instrument. Any reliance on the information contained herein is at the user's own risk."

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:
- **This MCP server**: Open an issue in this repository
- **MIPR data or services**: Contact the Junta de Planificación de Puerto Rico
- **MCP protocol**: See the [Model Context Protocol documentation](https://github.com/modelcontextprotocol)

---

**Note**: This is an unofficial implementation. For official JPPR services and data, visit [https://jp.pr.gov/](https://jp.pr.gov/). 