# OAuth Setup Guide for mcp-jppr

This guide explains how to complete the OAuth setup for mcp-jppr.

## What's Already Done ✅

- ✅ Framework updated to v3.0.0 with OAuth pattern
- ✅ Dependencies installed (`@cloudflare/workers-oauth-provider`, `octokit`)
- ✅ KV namespace placeholder added to `wrangler.jsonc`
- ✅ Worker code updated to use OAuth
- ✅ GitHub Actions workflow simplified (removed AWS Secrets Manager)

## Manual Steps Required 🔧

### 1. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: `mcp-jppr`
   - **Homepage URL**: `https://mcp-jppr.alianza-capital.workers.dev`
   - **Authorization callback URL**: `https://mcp-jppr.alianza-capital.workers.dev/callback`
4. Click "Register application"
5. **Save these values**:
   - Client ID (public, can be in config)
   - Client Secret (secret, generate new one)
   - Generate a Client Secret and save it securely

### 2. Create Cloudflare KV Namespace

```bash
cd /Users/angus/Code/mcp-jppr
npx wrangler kv namespace create "OAUTH_KV"
```

Copy the KV namespace ID from the output.

### 3. Update wrangler.jsonc

Replace `REPLACE_WITH_KV_ID` in `wrangler.jsonc` with the actual KV namespace ID from step 2.

### 4. Set OAuth Secrets in Cloudflare

You'll need these secrets:
- `GITHUB_CLIENT_ID` - From GitHub OAuth App
- `GITHUB_CLIENT_SECRET` - From GitHub OAuth App  
- `COOKIE_ENCRYPTION_KEY` - Generate with: `openssl rand -hex 32`

Set them via Wrangler (if you have Cloudflare API token configured):

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

Or set them via Cloudflare Dashboard:
1. Go to Workers & Pages → mcp-jppr → Settings → Variables
2. Add each secret under "Secrets"

### 5. Deploy and Test

```bash
npm run deploy:worker
```

Then test the OAuth flow:
1. Visit: `https://mcp-jppr.alianza-capital.workers.dev/authorize`
2. Should redirect to GitHub for authentication
3. After approval, callback should complete

## Current Implementation Status ⚠️

The current OAuth implementation is **simplified** and needs completion:

1. **OAuth Flow Handler**: Currently just redirects to GitHub and exchanges token
2. **Missing**: Full OAuthProvider integration with proper state management
3. **Missing**: Complete user context passing to the agent

### To Complete OAuth Implementation

You have two options:

**Option A: Use Cloudflare's Complete Example**
- Copy `github-handler.ts` and `workers-oauth-utils.ts` from `cloudflare-ai-examples/demos/remote-mcp-github-oauth`
- Integrate with OAuthProvider properly

**Option B: Implement Basic OAuth Manually**
- Current code handles basic GitHub OAuth flow
- Add proper session management
- Pass user context to tools

## Secrets Management

### Why Cloudflare, Not AWS?

For OAuth, we store secrets in **Cloudflare** because:
- ✅ Cloudflare KV is required by OAuthProvider (can't use AWS)
- ✅ Native Cloudflare secrets sync with Workers
- ✅ Simpler workflow (no AWS fetching needed)
- ✅ Better integration with OAuth flow

### Secrets to Store in Cloudflare

| Secret | Description | Source |
|--------|-------------|--------|
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret | GitHub OAuth App |
| `COOKIE_ENCRYPTION_KEY` | Cookie signing key | Generate: `openssl rand -hex 32` |

## Next Steps

1. ✅ Complete manual steps above
2. ⏳ Test OAuth flow end-to-end
3. ⏳ Consider if Bearer auth or OAuth better fits your use case
4. ⏳ Implement full OAuthProvider integration if needed

## Rollback to Bearer Auth

If you want to revert to Bearer auth:
1. Restore `cloudflare-worker.ts` from git history
2. Restore `.github/workflows/deploy-cloudflare.yml` from git history
3. Use AWS Secrets Manager for `MCP_BEARER_TOKEN` again

