# OAuth Setup Guide for mcp-jppr (AWS Cognito)

This guide explains how to complete the OAuth setup for mcp-jppr using AWS Cognito as the identity provider.

## What's Already Done ✅

- ✅ Framework updated to v3.0.0 with OAuth pattern
- ✅ Dependencies installed (`@cloudflare/workers-oauth-provider`)
- ✅ KV namespace placeholder added to `wrangler.jsonc`
- ✅ Worker code updated to use OAuth
- ✅ GitHub Actions workflow simplified (removed AWS Secrets Manager)
- ✅ AWS Cognito Terraform module created in `alianza-infra`

## Manual Steps Required 🔧

### 1. Deploy Cognito via Terraform

Navigate to the alianza-infra directory and deploy Cognito:

```bash
cd /Users/angus/Code/alianza-infra
terraform init
terraform plan -var-file="environments/prod/terraform.tfvars"
terraform apply
```

This will create:
- Cognito User Pool: `alianza-users`
- OAuth Client: `alianza-oauth-client`
- Hosted UI Domain: `alianza-capital-auth-prod.auth.{region}.amazoncognito.com`

### 2. Get Cognito Credentials

After deployment, get the credentials from Terraform outputs:

```bash
cd /Users/angus/Code/alianza-infra
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cognito_authorization_endpoint
terraform output cognito_token_endpoint
```

Save these values for the next steps.

### 3. Create Cloudflare KV Namespace

```bash
cd /Users/angus/Code/mcp-jppr
npx wrangler kv namespace create "OAUTH_KV"
```

Copy the KV namespace ID from the output.

### 4. Update wrangler.jsonc

Replace `REPLACE_WITH_KV_ID` in `wrangler.jsonc` with the actual KV namespace ID from step 3.

### 5. Set OAuth Secrets in Cloudflare

You'll need these secrets:
- `COGNITO_USER_POOL_ID` - From Terraform output
- `COGNITO_CLIENT_ID` - From Terraform output
- `COGNITO_DOMAIN` - From Terraform output (e.g., `alianza-capital-auth-prod`)
- `COGNITO_REGION` - AWS region (e.g., `us-east-2`)
- `COOKIE_ENCRYPTION_KEY` - Generate with: `openssl rand -hex 32`

Set them via Wrangler (if you have Cloudflare API token configured):

```bash
npx wrangler secret put COGNITO_USER_POOL_ID
npx wrangler secret put COGNITO_CLIENT_ID
npx wrangler secret put COGNITO_DOMAIN
npx wrangler secret put COGNITO_REGION
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

Or set them via Cloudflare Dashboard:
1. Go to Workers & Pages → mcp-jppr → Settings → Variables
2. Add each secret under "Secrets"

### 6. Create Cognito User

Create a test user in Cognito:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username admin \
  --user-attributes Name=email,Value=your-email@example.com \
  --message-action SUPPRESS

# Set temporary password
aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username admin \
  --password TempPassword123! \
  --permanent
```

Or use AWS Console:
1. Go to Cognito → User Pools → alianza-users
2. Click "Create user"
3. Enter username and email
4. Set temporary password

### 7. Update Cloudflare Worker Code

Update `src/cloudflare-worker.ts` to use Cognito endpoints instead of GitHub.

### 8. Deploy and Test

```bash
npm run deploy:worker
```

Then test the OAuth flow:
1. Visit: `https://mcp-jppr.alianza-capital.workers.dev/authorize`
2. Should redirect to Cognito hosted UI for authentication
3. After login, callback should complete

## AWS Cognito Configuration

### User Pool Settings

- **Pool Name**: `alianza-users`
- **Username**: Email (case-insensitive)
- **Password Policy**: 
  - Minimum 8 characters
  - Requires lowercase, uppercase, numbers, symbols
- **Email Verification**: Auto-verified
- **Recovery**: Via verified email

### OAuth Client Settings

- **Flows**: Authorization Code, Implicit
- **Scopes**: `openid`, `email`, `profile`
- **Callback URLs**: 
  - `https://mcp-jppr.alianza-capital.workers.dev/callback`
  - `http://localhost:8788/callback` (dev)
- **Logout URLs**:
  - `https://mcp-jppr.alianza-capital.workers.dev`
  - `http://localhost:8788` (dev)

### Hosted UI URLs

- **Authorization**: `https://{domain}.auth.{region}.amazoncognito.com/oauth2/authorize`
- **Token**: `https://{domain}.auth.{region}.amazoncognito.com/oauth2/token`
- **UserInfo**: `https://{domain}.auth.{region}.amazoncognito.com/oauth2/userInfo`
- **Logout**: `https://{domain}.auth.{region}.amazoncognito.com/logout`

## Current Implementation Status ⚠️

The current OAuth implementation needs to be updated to use Cognito:

1. **Update OAuth Handler**: Currently has GitHub OAuth code
2. **Update Endpoints**: Use Cognito endpoints instead of GitHub
3. **User Context**: Extract user info from Cognito tokens

### To Complete Cognito OAuth Integration

Update `src/cloudflare-worker.ts`:
- Replace GitHub OAuth endpoints with Cognito endpoints
- Update token exchange to use Cognito token endpoint
- Parse Cognito user info from ID token

## Secrets Management

### Secrets to Store in Cloudflare

| Secret | Description | Source |
|--------|-------------|--------|
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | Terraform output |
| `COGNITO_CLIENT_ID` | Cognito OAuth Client ID | Terraform output |
| `COGNITO_DOMAIN` | Cognito domain name | Terraform output |
| `COGNITO_REGION` | AWS region | `us-east-2` |
| `COOKIE_ENCRYPTION_KEY` | Cookie signing key | Generate: `openssl rand -hex 32` |

### Why Cloudflare Secrets?

- ✅ Cloudflare KV is required by OAuthProvider (can't use AWS)
- ✅ Native Cloudflare secrets sync with Workers
- ✅ Simpler workflow for OAuth integration
- ✅ AWS Cognito credentials are not sensitive (public client)

## Next Steps

1. ✅ Deploy Cognito via Terraform
2. ⏳ Get Cognito credentials from Terraform outputs
3. ⏳ Create Cloudflare KV namespace
4. ⏳ Set Cloudflare secrets
5. ⏳ Create test user in Cognito
6. ⏳ Update Worker code for Cognito
7. ⏳ Test OAuth flow end-to-end

## Rollback to Bearer Auth

If you want to revert to Bearer auth:
1. Restore `cloudflare-worker.ts` from git history
2. Restore `.github/workflows/deploy-cloudflare.yml` from git history
3. Use AWS Secrets Manager for `MCP_BEARER_TOKEN` again

## Adding Additional Tools

To add more MCP servers using the same Cognito pool:

1. Add callback URL to Cognito User Pool Client in Terraform
2. Update `callback_urls` in `alianza-infra/main.tf`
3. Re-apply Terraform
4. Set same Cloudflare secrets in new Worker
5. Deploy!

The Cognito User Pool is shared across all Alianza tools - one pool, many clients!
