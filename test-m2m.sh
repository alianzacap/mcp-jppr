#!/bin/bash
# Test M2M Authentication Flow
# Run this after merging PRs and retrieving M2M credentials from Auth0

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing M2M Authentication${NC}"
echo ""

# Check if credentials are provided
if [ -z "$M2M_CLIENT_ID" ] || [ -z "$M2M_CLIENT_SECRET" ]; then
  echo -e "${RED}Error: M2M_CLIENT_ID and M2M_CLIENT_SECRET environment variables must be set${NC}"
  echo ""
  echo "To get credentials:"
  echo "1. Navigate to Auth0 Dashboard: https://manage.auth0.com"
  echo "2. Go to Applications → mcp-jppr-m2m"
  echo "3. Copy Client ID and Client Secret"
  echo ""
  echo "Then run:"
  echo "export M2M_CLIENT_ID='your-client-id'"
  echo "export M2M_CLIENT_SECRET='your-client-secret'"
  echo "bash test-m2m.sh"
  exit 1
fi

echo -e "${GREEN}Step 1: Getting access token from Auth0...${NC}"
TOKEN_RESPONSE=$(curl -s -X POST https://dev-alianzacap.us.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "'$M2M_CLIENT_ID'",
    "client_secret": "'$M2M_CLIENT_SECRET'",
    "audience": "urn:mcp-jppr",
    "grant_type": "client_credentials"
  }')

echo "$TOKEN_RESPONSE" | jq .

# Extract token
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}Failed to obtain access token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Token obtained successfully${NC}"
echo ""

echo -e "${GREEN}Step 2: Testing health endpoint...${NC}"
curl -s https://mcp-jppr.alianza-capital.workers.dev/health | jq .

echo ""
echo -e "${GREEN}Step 3: Testing M2M endpoint - List tools...${NC}"
curl -X POST https://mcp-jppr.alianza-capital.workers.dev/mcp-m2m \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: test-session-123" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }' | jq .

echo ""
echo -e "${GREEN}Step 4: Testing M2M endpoint - Search properties...${NC}"
curl -X POST https://mcp-jppr.alianza-capital.workers.dev/mcp-m2m \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: test-session-123" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_properties",
      "arguments": {
        "query": "San Juan"
      }
    },
    "id": 2
  }' | jq .

echo ""
echo -e "${GREEN}✅ M2M authentication test completed${NC}"

