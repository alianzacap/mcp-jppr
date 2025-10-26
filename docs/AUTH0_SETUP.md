# Auth0 OAuth Setup for mcp-jppr

## Overview

The mcp-jppr MCP server uses Auth0 for OAuth authentication. All credentials are centrally managed in AWS Secrets Manager as the single source of truth.

## Architecture

```
User/MCP Client
    ↓ (OAuth flow)
mcp-jppr Cloudflare Worker
    ↓ (OIDC)
Auth0 (dev-alianzacap.us.auth0.com)
    ↓ (validates)
User authenticates
    ↓ (tokens)
Worker receives access token
    ↓ (authenticated)
MCP tools available
```

## Credentials Management

### Single Source of Truth: AWS Secrets Manager

**Secret Name**: `alianza/auth0-mcp-jppr-client`  
**Region**: `us-east-2`  
**ARN**: `arn:aws:secretsmanager:us-east-2:915848750366:secret:alianza/auth0-mcp-jppr-client-h05kGZ`

**Contents**:
```json
{
  "domain": "dev-alianzacap.us.auth0.com",
  "client_id": "7N12nkFSXeyJpj8gQDMg8bNeFumTsLTT",
  "client_secret": "<sensitive>",
  "audience": "urn:mcp-jppr",
  "issuer": "https://dev-alianzacap.us.auth0.com/"
}
```

### How Secrets Flow

```
AWS Secrets Manager (alianza/auth0-mcp-jppr-client)
    ↓ (manual sync)
Cloudflare Worker Secrets
    ↓ (runtime)
mcp-jppr Worker (uses for OAuth)
```

## Local Development

### Setup .dev.vars

The `.dev.vars` file is gitignored and contains local development credentials:

```bash
# Auth0 configuration
AUTH0_DOMAIN=dev-alianzacap.us.auth0.com
AUTH0_CLIENT_ID=7N12nkFSXeyJpj8gQDMg8bNeFumTsLTT
AUTH0_CLIENT_SECRET=0QCdZoAbpTtp9XInRQ2MgK78HdjdKs2tu7D7iWPNXBerJ8QhqnlkJ36fTdK3pQeU
AUTH0_AUDIENCE=urn:mcp-jppr
AUTH0_SCOPE=openid email profile offline_access read:properties search:properties
NODE_ENV=development
```

### Get Credentials from AWS

```bash
# Fetch and display (for copying to .dev.vars)
aws secretsmanager get-secret-value \
  --secret-id alianza/auth0-mcp-jppr-client \
  --region us-east-2 \
  --query 'SecretString' \
  --output text | jq .
```

### Start Development Server

```bash
npx wrangler dev
```

The server will use credentials from `.dev.vars`.

## Production Deployment

### Step 1: Sync Secrets to Cloudflare

Run the sync script to copy secrets from AWS to Cloudflare:

```bash
cd /path/to/mcp-jppr
./scripts/sync-secrets-from-aws.sh
```

This automatically:
1. Fetches credentials from AWS Secrets Manager
2. Sets them as Cloudflare Worker secrets
3. Confirms all secrets are synced

### Step 2: Deploy Worker

```bash
npx wrangler deploy
```

### Step 3: Verify Deployment

```bash
curl https://mcp-jppr.alianza-capital.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "mcp-jppr",
  "version": "1.1.0",
  "auth": "oauth",
  "endpoints": ["/mcp", "/authorize", "/callback", "/register", "/token"]
}
```

## Testing OAuth Flow

### With Claude Desktop

**Config file**: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

**Testing**:
1. Restart Claude Desktop
2. Browser opens for OAuth login
3. Login with Auth0 credentials
4. Grant consent
5. MCP tools become available in Claude

### With MCP Inspector

1. Navigate to MCP Inspector
2. Set transport to `sse`
3. URL: `https://mcp-jppr.alianza-capital.workers.dev/sse`
4. Connect and authenticate via OAuth

### Manual Testing

**Register a client**:
```bash
curl -X POST https://mcp-jppr.alianza-capital.workers.dev/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["https://example.com/callback"]
  }'
```

**Test authorization** (in browser):
```
https://mcp-jppr.alianza-capital.workers.dev/authorize?client_id=<client_id>&redirect_uri=https://example.com/callback&response_type=code&scope=openid+email+profile
```

## Auth0 Configuration

### Test User

- **Email**: `test@alianzacap.com`
- **Password**: `TempPass123!`
- **User ID**: `auth0|68fd4ba58850953cbe50ac99`

### Auth0 Dashboard Access

- **URL**: https://manage.auth0.com
- **Tenant**: dev-alianzacap.us.auth0.com
- **Applications**: Applications → mcp-jppr
- **API**: Applications → APIs → JPPR Data API

## Updating Credentials

### When Auth0 Client Secret Changes

1. **Update in AWS Secrets Manager**:
   ```bash
   aws secretsmanager update-secret \
     --secret-id alianza/auth0-mcp-jppr-client \
     --secret-string '{
       "domain": "dev-alianzacap.us.auth0.com",
       "client_id": "7N12nkFSXeyJpj8gQDMg8bNeFumTsLTT",
       "client_secret": "NEW_SECRET",
       "audience": "urn:mcp-jppr",
       "issuer": "https://dev-alianzacap.us.auth0.com/"
     }' \
     --region us-east-2
   ```

2. **Sync to Cloudflare**:
   ```bash
   ./scripts/sync-secrets-from-aws.sh
   ```

3. **Update local .dev.vars** (for local development)

4. **Redeploy if needed**:
   ```bash
   npx wrangler deploy
   ```

## Troubleshooting

### OAuth Flow Fails

**Check logs**:
```bash
# Cloudflare dashboard logs
# Or local wrangler dev output
```

**Common issues**:
- Callback URL not registered in Auth0
- Secrets not synced to Cloudflare
- User doesn't exist in Auth0

### "Invalid client" Error

**Cause**: MCP client hasn't registered yet

**Solution**: MCP clients must call `/register` endpoint first

### "Unauthorized" Error

**Cause**: Client secret mismatch or expired

**Solution**: Re-sync secrets from AWS to Cloudflare

```bash
./scripts/sync-secrets-from-aws.sh
```

## Migration from Cognito

We migrated from AWS Cognito to Auth0 on October 25, 2025 because:

1. **Cognito Hosted UI was broken** - Generic errors with no debugging info
2. **Better debugging with Auth0** - Actual error logs and messages
3. **Proven reliability** - Auth0 is industry-standard
4. **Better developer experience** - Clearer documentation and setup

All Cognito resources have been destroyed. Historical documentation is preserved in Git history.

## References

- [Auth0 Documentation](https://auth0.com/docs)
- [MCP OAuth Specification](https://spec.modelcontextprotocol.io/specification/2025-11-05/authentication/oauth/)
- [Cloudflare Workers OAuth Provider](https://github.com/cloudflare/mcp-server-cloudflare)
- Infrastructure Docs: `alianza-infra/docs/AUTH0.md`

