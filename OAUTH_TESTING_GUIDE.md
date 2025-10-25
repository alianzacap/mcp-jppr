# OAuth Testing Guide for mcp-jppr

## Understanding the Error

The error you encountered:
```
Authorization endpoint error: Error: Invalid client. The clientId provided does not match to this client.
```

This means the `client_id` in your test request hasn't been registered with the OAuth provider yet.

## How OAuth Registration Works

The MCP OAuth flow requires **two steps**:

1. **Client Registration** (`/register` endpoint)
   - MCP clients (like Claude Desktop) call this first
   - Receives a `client_id` and `client_secret`
   - Stored in OAUTH_KV namespace

2. **Authorization** (`/authorize` endpoint)
   - Uses the registered `client_id` from step 1
   - Redirects to Cognito for user authentication
   - Returns authorization code

## Testing Options

### Option 1: Register a Test Client (Recommended for Manual Testing)

Before testing `/authorize`, you need to register a client:

```bash
# Start your dev server
npx wrangler dev

# In another terminal, register a test client
curl -X POST http://localhost:8787/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test MCP Client",
    "redirect_uris": ["http://localhost:8787/callback"]
  }'
```

**Expected Response:**
```json
{
  "client_id": "generated-client-id-here",
  "client_secret": "generated-client-secret-here",
  "client_name": "Test MCP Client",
  "redirect_uris": ["http://localhost:8787/callback"]
}
```

**Then test authorization** with the returned `client_id`:
```bash
# Replace YOUR_CLIENT_ID with the client_id from the registration response
open "http://localhost:8787/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8787/callback&response_type=code&scope=openid+email+profile"
```

### Option 2: Use Claude Desktop (Real World Testing)

The proper way to test is with Claude Desktop or another MCP client that handles the full OAuth flow automatically:

1. **Configure Claude Desktop** to use your mcp-jppr server:

   Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "jppr": {
         "url": "http://localhost:8787/mcp",
         "transport": {
           "type": "http",
           "auth": {
             "type": "oauth",
             "authorizationUrl": "http://localhost:8787/authorize",
             "tokenUrl": "http://localhost:8787/token",
             "registrationUrl": "http://localhost:8787/register"
           }
         }
       }
     }
   }
   ```

2. **Start wrangler dev**:
   ```bash
   cd /Users/angus/Code/mcp-jppr
   npx wrangler dev
   ```

3. **Launch Claude Desktop**
   - It will automatically register itself via `/register`
   - Then initiate the OAuth flow via `/authorize`
   - You'll be redirected to Cognito to login
   - After login, you'll be redirected back with authentication

### Option 3: Test Registration Endpoint First

Just verify the registration endpoint works:

```bash
# Start dev server
npx wrangler dev

# Test registration
curl -v -X POST http://localhost:8787/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My Test Client",
    "redirect_uris": ["http://localhost:8787/callback", "http://localhost:3000/callback"]
  }'
```

**Check the response**:
- Status should be 201 Created
- Should return client_id and client_secret
- Client should be stored in OAUTH_KV

## Complete OAuth Flow

Here's the complete flow that happens:

```
1. MCP Client → POST /register
   ← Returns client_id and client_secret

2. MCP Client → GET /authorize?client_id=...
   → Worker validates client_id exists in OAUTH_KV ✅
   → Redirects to Cognito Hosted UI

3. User logs in at Cognito
   ← Cognito redirects to /callback?code=...

4. Worker → POST /token (Cognito)
   ← Receives access_token and id_token
   → Completes OAuth flow
   ← Redirects client with auth tokens

5. MCP Client can now call /mcp with Bearer token
```

## Debugging Tips

### Check KV Storage

To see registered clients in your OAUTH_KV namespace:

```bash
# List keys in KV
npx wrangler kv:key list --binding OAUTH_KV

# Read a specific client
npx wrangler kv:key get "oauth:client:YOUR_CLIENT_ID" --binding OAUTH_KV
```

### Enable Verbose Logging

The worker now has comprehensive logging. Watch the console output for:
- Authorization requests with client IDs
- Token exchange status
- Cognito responses
- User authentication results

### Common Issues

**Issue**: "Invalid client" error  
**Solution**: Register the client via `/register` first

**Issue**: Cognito returns error page  
**Solution**: Verify Cognito endpoints are correct (`-dev` not `-prod`)

**Issue**: Token exchange fails  
**Solution**: Check COGNITO_CLIENT_SECRET is set correctly in secrets

## Testing Checklist

- [ ] Dev server running (`npx wrangler dev`)
- [ ] `.dev.vars` file exists with correct credentials
- [ ] OAUTH_KV namespace is accessible
- [ ] Register a test client via `/register`
- [ ] Use returned `client_id` in `/authorize` request
- [ ] Login at Cognito with test user (`test@alianzacap.com` / `TempPass123!`)
- [ ] Verify callback completes successfully
- [ ] Check console logs for any errors

## Next Steps

Once local testing works:

1. **Deploy to production**:
   ```bash
   npx wrangler deploy
   ```

2. **Update Cloudflare secrets**:
   ```bash
   npx wrangler secret put COGNITO_CLIENT_ID
   npx wrangler secret put COGNITO_CLIENT_SECRET
   ```

3. **Test production OAuth flow** with Claude Desktop pointing to production URL

## References

- [MCP OAuth Specification](https://spec.modelcontextprotocol.io/specification/2025-11-05/authentication/oauth/)
- [@cloudflare/workers-oauth-provider](https://github.com/cloudflare/mcp-server-cloudflare)
- [AWS Cognito OAuth 2.0](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-userpools-server-contract-reference.html)

