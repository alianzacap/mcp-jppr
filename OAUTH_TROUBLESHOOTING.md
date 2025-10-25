# OAuth Troubleshooting Documentation - ARCHIVED

## ✅ RESOLVED - October 25, 2025

**Root Cause**: AWS Cognito Hosted UI was fundamentally broken - even fresh User Pools returned generic errors with no debugging information.

**Final Solution**: Migrated from AWS Cognito to Auth0.

### What We Tried with Cognito
- Fixed environment mismatches (prod vs dev endpoints)
- Added missing OAuth flows (ALLOW_USER_SRP_AUTH)
- Fixed callback URL configurations (port 8787 vs 8788)
- Created fresh User Pools from scratch
- Recreated domains multiple times
- All efforts resulted in the same generic "An error was encountered with the requested page" with no actual error details

### Why We Switched to Auth0
1. **Better Debugging**: Auth0 provides actual error logs and messages
2. **Proven Reliability**: Already had working Auth0 implementation in `remote-mcp-auth0-demo`
3. **Better Documentation**: Clearer setup and troubleshooting guides
4. **No Domain Issues**: No mysterious domain configuration problems
5. **Industry Standard**: Used successfully by millions of applications

### Migration Complete
- Cognito removed from Terraform (October 25, 2025)
- mcp-jppr migrated to Auth0 OAuth
- All Cognito resources destroyed
- See `AUTH0_SETUP.md` for current configuration

---

## Historical Cognito Documentation (For Reference Only)

This section is preserved for historical reference but is no longer relevant.

## Overview

We are implementing OAuth authentication for the `mcp-jppr` Cloudflare Worker using AWS Cognito as the identity provider. The Worker uses Cloudflare's `@cloudflare/workers-oauth-provider` library to handle the OAuth flow.

## Goal

Enable OAuth authentication so that:
1. Users authenticate via AWS Cognito Hosted UI
2. MCP clients (like Claude Desktop) can connect to the mcp-jppr server
3. The server can identify the authenticated user

## Architecture

### Components

1. **mcp-jppr Cloudflare Worker** (`src/cloudflare-worker.ts`)
   - Uses `OAuthProvider` from `@cloudflare/workers-oauth-provider`
   - Handles MCP protocol at `/mcp` endpoint
   - Provides OAuth endpoints: `/authorize`, `/callback`, `/register`, `/token`
   - Uses Hono for OAuth handler routing

2. **AWS Cognito User Pool**
   - User Pool ID: `us-east-2_LZ46Pz8Wt`
   - Pool Name: `alianza-users`
   - Domain: `alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com`

3. **Cognito OAuth Client**
   - Client ID: `77a60ra5jbko02i44ank8t7hjm`
   - Client Name: `alianza-oauth-client-v3`
   - Client Secret: `10f7fuu8mo4b3ab9kp671agn31hjrmn2h94ta1lherp1v36thbsj`

## Terraform Configuration

### Location

AWS Cognito resources are defined in:
- `alianza-infra/modules/security/cognito/main.tf` - Main Cognito module
- `alianza-infra/main.tf` - Module instantiation

### Current Configuration

**alianza-infra/modules/security/cognito/main.tf:**
```terraform
resource "aws_cognito_user_pool" "alianza_users" {
  name = var.user_pool_name

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  auto_verified_attributes = ["email"]
  
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = var.tags
}

resource "aws_cognito_user_pool_client" "alianza_oauth_client" {
  name         = var.client_name
  user_pool_id = aws_cognito_user_pool.alianza_users.id

  # OAuth flows
  generate_secret                      = true # Confidential client for server-to-server communication
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true

  # Callback URLs (add specific URLs per environment)
  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Prevent user existence errors (security)
  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_pool_domain" "alianza_users_domain" {
  domain       = var.domain_name
  user_pool_id = aws_cognito_user_pool.alianza_users.id
}
```

**alianza-infra/main.tf (Cognito module instantiation):**
```terraform
module "cognito" {
  source = "./modules/security/cognito"

  user_pool_name = "alianza-users"
  client_name    = "alianza-oauth-client"
  domain_name    = "alianza-capital-auth-${var.environment}"

  callback_urls = [
    "https://mcp-jppr.alianza-capital.workers.dev/callback",
    "http://localhost:8788/callback"
  ]

  logout_urls = [
    "https://mcp-jppr.alianza-capital.workers.dev",
    "http://localhost:8788"
  ]

  tags = var.tags
}
```

## Secrets Management

### AWS Secrets Manager

The Cognito client secret is stored in AWS Secrets Manager:

**Secret Name:** `alianza/cognito-oauth-client-secret`  
**Secret ARN:** `arn:aws:secretsmanager:us-east-2:915848750366:secret:alianza/cognito-oauth-client-secret-rgDmlO`  
**Format:** JSON with `client_id` and `client_secret`

```json
{
  "client_id": "77a60ra5jbko02i44ank8t7hjm",
  "client_secret": "10f7fuu8mo4b3ab9kp671agn31hjrmn2h94ta1lherp1v36thbsj"
}
```

**Why Secrets Manager?**
- Cloudflare secrets cannot be retrieved once set
- Needed for sharing credentials across services
- AWS Secrets Manager allows retrieval via API

### Cloudflare Secrets

The Cognito credentials are also stored as Cloudflare Worker secrets:
- `COGNITO_CLIENT_ID` - Set via `wrangler secret put`
- `COGNITO_CLIENT_SECRET` - Set via `wrangler secret put`
- `COGNITO_AUTHORIZATION_ENDPOINT` - Environment variable in `wrangler.jsonc`
- `COGNITO_TOKEN_ENDPOINT` - Environment variable in `wrangler.jsonc`

### Local Development

Local development uses `.dev.vars` file (gitignored):

```bash
COGNITO_CLIENT_ID=77a60ra5jbko02i44ank8t7hjm
COGNITO_CLIENT_SECRET=10f7fuu8mo4b3ab9kp671agn31hjrmn2h94ta1lherp1v36thbsj
COGNITO_AUTHORIZATION_ENDPOINT=https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/authorize
COGNITO_TOKEN_ENDPOINT=https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/token
```

## Public vs Confidential Client

### The Issue

We initially created a **public client** (no secret) with Terraform:
```terraform
generate_secret = false
```

Public clients are typically used for:
- Browser-based applications
- Mobile apps where the secret cannot be kept confidential
- Single-page applications

**Problems with public clients:**
- Less secure - anyone with the client_id can attempt authentication
- Not appropriate for server-to-server communication
- Cannot use `client_secret_basic` or `client_secret_post` authentication methods

### Why Confidential Client?

For Cloudflare Workers (server-to-server communication):
- We can store the secret securely in Cloudflare
- The secret never leaves the server
- More secure authentication
- Industry best practice for backend services

### Terraform State Secret Storage

**Important Note:** When Terraform creates a Cognito client with `generate_secret = true`, the secret is stored in Terraform state. However, we decided to **NOT output the secret** from Terraform to avoid storing secrets in version control.

**Current approach:**
1. Terraform creates the client (secret stored in AWS Cognito and Terraform state)
2. We retrieve the secret manually via AWS CLI
3. Store it in AWS Secrets Manager for future reference
4. Store it in Cloudflare Worker secrets
5. **Do NOT output secret from Terraform** (removed from `outputs.tf`)

## Root Cause Analysis

### The Problem

**Environment Mismatch**: The `wrangler.jsonc` configuration pointed to **non-existent** Cognito endpoints:
- Configured: `alianza-capital-auth-prod.auth.us-east-2.amazoncognito.com`
- Actual deployment: `alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com`

### Why This Happened

Terraform infrastructure uses `environment = "dev"` as the production environment label (from `terraform.tfvars`), which creates:
- Cognito domain: `alianza-capital-auth-dev` ✅
- Client ID: `77a60ra5jbko02i44ank8t7hjm` ✅
- S3 bucket: `alianza-lambda-artifacts-dev` ✅

However, `wrangler.jsonc` was incorrectly configured with `-prod` endpoints that don't exist.

### The Symptom

When accessing the `/authorize` endpoint, the Worker redirected to:
```
https://alianza-capital-auth-prod.auth.us-east-2.amazoncognito.com/oauth2/authorize...
```

Cognito returned an error because this domain doesn't exist.

### What We've Tried

1. **Created multiple Cognito clients** - All return error
2. **Verified callback URLs** - Present and correct
3. **Verified OAuth flows** - `code` and `implicit` enabled
4. **Verified OAuth scopes** - `openid`, `email`, `profile` enabled
5. **Verified explicit auth flows** - Password auth enabled
6. **Enabled OAuth flows for user pool client** - Set to true
7. **Tried both public and confidential clients** - Both return errors
8. **Verified client secret** - Secret exists and is retrievable
9. **Tried different redirect URIs** - None work
10. **Checked domain configuration** - Domain exists and is accessible

### AWS CLI Command Used to Check Client

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-east-2_LZ46Pz8Wt \
  --client-id 77a60ra5jbko02i44ank8t7hjm \
  --output json | jq '.UserPoolClient | {ClientId, ClientName, GenerateSecret, AllowedOAuthFlows, AllowedOAuthScopes, CallbackURLs, AllowedOAuthFlowsUserPoolClient, ExplicitAuthFlows}'
```

**Result:**
```json
{
  "ClientId": "77a60ra5jbko02i44ank8t7hjm",
  "ClientName": "alianza-oauth-client-v3",
  "GenerateSecret": null,
  "AllowedOAuthFlows": ["code", "implicit"],
  "AllowedOAuthScopes": ["email", "openid", "profile"],
  "CallbackURLs": [
    "http://localhost:8788/callback",
    "https://mcp-jppr.alianza-capital.workers.dev/callback"
  ],
  "AllowedOAuthFlowsUserPoolClient": true,
  "ExplicitAuthFlows": [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
}
```

**Note:** Despite creating with `--generate-secret`, `GenerateSecret` shows as `null`. However, the secret exists and is retrievable.

## Cloudflare Worker Code

### Current Implementation

**mcp-jppr/src/cloudflare-worker.ts:**

```typescript
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hono } from 'hono';
import { createToolEntry } from '@alianzacap/mcp-framework';
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

interface Env {
  MCP_OBJECT: any;
  OAUTH_KV: any;
  COGNITO_CLIENT_ID: string;
  COGNITO_CLIENT_SECRET: string;
  COGNITO_AUTHORIZATION_ENDPOINT: string;
  COGNITO_TOKEN_ENDPOINT: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

type Props = {
  email: string;
  name: string;
  sub: string;
};

export class JPPRMcpAgent extends McpAgent<any, Record<string, never>, Props> {
  server = new McpServer({
    name: 'mcp-jppr',
    version: '1.1.0'
  });

  async init() {
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

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/health", async (c) => {
  return c.json({
    status: 'healthy',
    service: 'mcp-jppr',
    version: '1.1.0',
    auth: 'oauth',
    endpoints: ['/mcp', '/authorize', '/callback', '/register', '/token']
  });
});

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }

  const state = btoa(JSON.stringify(oauthReqInfo));
  const redirectUrl = `${c.env.COGNITO_AUTHORIZATION_ENDPOINT}?` +
    `client_id=${c.env.COGNITO_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(new URL('/callback', c.req.url).href)}&` +
    `response_type=code&` +
    `scope=openid+email+profile&` +
    `state=${state}`;
  
  return Response.redirect(redirectUrl);
});

app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  
  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  const oauthReqInfo = JSON.parse(atob(state)) as AuthRequest;
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid state", 400);
  }

  const tokenUrl = `${c.env.COGNITO_TOKEN_ENDPOINT}`;
  const credentials = btoa(`${c.env.COGNITO_CLIENT_ID}:${c.env.COGNITO_CLIENT_SECRET}`);
  
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/callback', c.req.url).href
    })
  });
  
  if (!tokenResponse.ok) {
    return c.text('Failed to exchange code for token', 500);
  }
  
  const { access_token, id_token } = await tokenResponse.json();
  
  if (!access_token || !id_token) {
    return c.text('Failed to get tokens', 500);
  }
  
  const [, payload] = id_token.split('.');
  const userInfo = JSON.parse(atob(payload));
  
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    metadata: {
      label: userInfo.name || userInfo.email,
    },
    props: {
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      sub: userInfo.sub,
    } as Props,
    request: oauthReqInfo,
    scope: oauthReqInfo.scope,
    userId: userInfo.sub,
  });

  return Response.redirect(redirectTo);
});

const CognitoHandler = app;

export default new OAuthProvider({
  apiHandler: JPPRMcpAgent.mount("/mcp") as any,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: CognitoHandler as any,
  tokenEndpoint: "/token",
});
```

## Additional Context

### Cognito User Pool Details

- **User Pool ID:** `us-east-2_LZ46Pz8Wt`
- **Domain:** `alianza-capital-auth-dev`
- **Test User:** `test@alianzacap.com` (password: `TempPass123!`)
- **Region:** `us-east-2`

### Callback URLs Configured

1. `http://localhost:8788/callback` - Local development
2. `https://mcp-jppr.alianza-capital.workers.dev/callback` - Production

### Cloudflare KV Namespace

- Binding: `OAUTH_KV`
- ID: `1b17eab274d244df8aef153db187d86a`
- Used by `@cloudflare/workers-oauth-provider` for session storage

## Questions for Debugging

1. Why does Cognito return an error page even with a properly configured client?
2. Is there a mismatch between how we're calling Cognito's authorization endpoint and what it expects?
3. Are there any required parameters missing from the authorization request?
4. Is there an issue with the domain configuration or CORS?
5. Should we be using a different OAuth flow or configuration?
6. Is there an AWS console error message we're not seeing?

## Solution Implemented

### 1. Fixed Cognito Endpoints in wrangler.jsonc

Updated `/Users/angus/Code/mcp-jppr/wrangler.jsonc`:

```jsonc
"vars": {
  "COGNITO_AUTHORIZATION_ENDPOINT": "https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/authorize",
  "COGNITO_TOKEN_ENDPOINT": "https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/token"
}
```

### 2. Created Local Development Configuration

Created `.dev.vars` file for local development:

```bash
COGNITO_CLIENT_ID=77a60ra5jbko02i44ank8t7hjm
COGNITO_CLIENT_SECRET=10f7fuu8mo4b3ab9kp671agn31hjrmn2h94ta1lherp1v36thbsj
COGNITO_AUTHORIZATION_ENDPOINT=https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/authorize
COGNITO_TOKEN_ENDPOINT=https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/token
```

### 3. Added Comprehensive Error Logging

Enhanced `src/cloudflare-worker.ts` with detailed logging:

**Authorization endpoint (`/authorize`)**:
- Logs MCP client ID and Cognito client ID
- Logs callback URL and redirect URL
- Catches and logs any errors with full details

**Callback endpoint (`/callback`)**:
- Checks for Cognito error responses (error, error_description)
- Logs all token exchange attempts with status codes
- Logs successful authentications with user info
- Comprehensive error handling with detailed messages

### 4. Verify Production Secrets

To verify/update Cloudflare Worker production secrets:

```bash
cd /Users/angus/Code/mcp-jppr

# List current secrets
npx wrangler secret list

# Update if needed
npx wrangler secret put COGNITO_CLIENT_ID
# Enter: 77a60ra5jbko02i44ank8t7hjm

npx wrangler secret put COGNITO_CLIENT_SECRET  
# Enter: 10f7fuu8mo4b3ab9kp671agn31hjrmn2h94ta1lherp1v36thbsj
```

## Testing the OAuth Flow

### Local Development

1. **Start local dev server:**
   ```bash
   cd /Users/angus/Code/mcp-jppr
   npx wrangler dev
   ```

2. **Test authorization endpoint:**
   ```
   http://localhost:8788/authorize?client_id=test&redirect_uri=http://localhost:8788/callback&response_type=code&scope=openid+email+profile
   ```

3. **Verify redirect goes to correct Cognito Hosted UI:**
   - Should redirect to: `https://alianza-capital-auth-dev.auth.us-east-2.amazoncognito.com/oauth2/authorize...`
   - Login with test user: `test@alianzacap.com` (password: `TempPass123!`)

4. **Check logs for detailed debugging info:**
   - Authorization request details
   - Token exchange status
   - User authentication results

### Production Deployment

1. **Deploy updated configuration:**
   ```bash
   npx wrangler deploy
   ```

2. **Test production endpoint:**
   ```
   https://mcp-jppr.alianza-capital.workers.dev/authorize?client_id=test&redirect_uri=https://mcp-jppr.alianza-capital.workers.dev/callback&response_type=code&scope=openid+email+profile
   ```

## Environment Strategy

### Current Setup (As of October 2025)

- **Terraform environment label**: `"dev"`
- **Actual usage**: Production traffic
- **Why**: Small startup, single environment for now
- **Impact**: Resources have `-dev` suffix but serve production

**Resources with environment suffix:**
1. Cognito domain: `alianza-capital-auth-dev`
2. S3 artifacts bucket: `alianza-lambda-artifacts-dev`
3. CloudWatch log group: `/aws/apigateway/karibe-dev-access`

**Resources with fixed names (no environment suffix):**
- Lambda functions: `get-latest-karibe-codes`, `karibe-fetcher`, etc.
- Cognito User Pool: `alianza-users`
- Cognito Client: `alianza-oauth-client`
- API Gateway: `karibe`
- DynamoDB: `karibe_verification_codes`
- Cloudflare Workers: `mcp-jppr` (not managed by Terraform)

### Future Environment Strategy

When creating true dev/staging/prod separation:

1. **Create separate Terraform workspaces/states**:
   - `environments/dev/terraform.tfvars` with `environment = "dev"`
   - `environments/staging/terraform.tfvars` with `environment = "staging"`
   - `environments/prod/terraform.tfvars` with `environment = "prod"`

2. **Deploy separate infrastructure**:
   - Each environment gets its own Cognito domain, S3 buckets, etc.
   - Consider renaming current "dev" to "prod" for clarity

3. **Configure Cloudflare Workers per environment**:
   - Use wrangler environments feature
   - Separate secrets per environment
   - Different worker names or routes per environment

## Next Steps

