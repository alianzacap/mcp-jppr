#!/bin/bash
# Sync Auth0 secrets from AWS Secrets Manager to Cloudflare Workers
# Single source of truth: AWS Secrets Manager
# Run this script whenever Auth0 credentials change

set -e

echo "🔄 Syncing Auth0 secrets from AWS Secrets Manager to Cloudflare Workers..."
echo ""

# Fetch GitHub PAT from AWS Secrets Manager
echo "📥 Fetching GitHub PAT from AWS Secrets Manager..."
GH_PAT_SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id alianza/github-packages-pat \
  --region us-east-2 \
  --query 'SecretString' \
  --output text)

GH_TOKEN=$(echo $GH_PAT_SECRET_JSON | jq -r '.token')
export GH_TOKEN # Export for npm ci to use

echo "✅ GitHub PAT retrieved from AWS"
echo ""

# Configure npm for GitHub Packages
echo "⚙️ Configuring npm for GitHub Packages..."
echo "@alianzacap:registry=https://npm.pkg.github.com" > .npmrc
echo "//npm.pkg.github.com/:_authToken=${GH_TOKEN}" >> .npmrc
echo "✅ npm configured"
echo ""

# Fetch Cloudflare API token from AWS Secrets Manager
echo "📥 Fetching Cloudflare API token from AWS..."
export CLOUDFLARE_API_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id alianza/cloudflare-workers-token \
  --region us-east-2 \
  --query 'SecretString' \
  --output text | jq -r '.api_token')

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ "$CLOUDFLARE_API_TOKEN" = "null" ]; then
  echo "❌ Error: Could not retrieve Cloudflare API token from AWS Secrets Manager"
  echo "   Expected secret: alianza/cloudflare-workers-token"
  exit 1
fi

echo "✅ Cloudflare API token retrieved"
echo ""

# Fetch mcp-jppr application credentials from AWS Secrets Manager
echo "📥 Fetching Auth0 secrets from AWS Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id alianza/auth0-mcp-jppr-client \
  --region us-east-2 \
  --query 'SecretString' \
  --output text)

echo "✅ Auth0 secrets retrieved from AWS"
echo ""

# Extract values
AUTH0_DOMAIN=$(echo $SECRET_JSON | jq -r '.domain')
AUTH0_CLIENT_ID=$(echo $SECRET_JSON | jq -r '.client_id')
AUTH0_CLIENT_SECRET=$(echo $SECRET_JSON | jq -r '.client_secret')
AUTH0_AUDIENCE=$(echo $SECRET_JSON | jq -r '.audience')
AUTH0_SCOPE="openid email profile offline_access read:properties search:properties"

# Validate values
if [ -z "$AUTH0_DOMAIN" ] || [ "$AUTH0_DOMAIN" = "null" ]; then
  echo "❌ Error: AUTH0_DOMAIN not found in secrets"
  exit 1
fi

echo "📤 Setting Cloudflare Worker secrets..."
echo ""

# CLOUDFLARE_API_TOKEN is already exported above from AWS Secrets Manager
# Wrangler will use it automatically

echo "  Setting AUTH0_DOMAIN..."
echo "$AUTH0_DOMAIN" | npx wrangler secret put AUTH0_DOMAIN

echo "  Setting AUTH0_CLIENT_ID..."
echo "$AUTH0_CLIENT_ID" | npx wrangler secret put AUTH0_CLIENT_ID

echo "  Setting AUTH0_CLIENT_SECRET..."
echo "$AUTH0_CLIENT_SECRET" | npx wrangler secret put AUTH0_CLIENT_SECRET

echo "  Setting AUTH0_AUDIENCE..."
echo "$AUTH0_AUDIENCE" | npx wrangler secret put AUTH0_AUDIENCE

echo "  Setting AUTH0_SCOPE..."
echo "$AUTH0_SCOPE" | npx wrangler secret put AUTH0_SCOPE

echo "  Setting NODE_ENV..."
echo "production" | npx wrangler secret put NODE_ENV

echo ""
echo "✅ All secrets synced to Cloudflare Workers!"
echo ""
echo "📋 Summary:"
echo "  Source: AWS Secrets Manager (alianza/auth0-mcp-jppr-client)"
echo "  Destination: Cloudflare Worker (mcp-jppr)"
echo "  Auth0 Domain: $AUTH0_DOMAIN"
echo "  Auth0 Client ID: $AUTH0_CLIENT_ID"
echo "  Auth0 Audience: $AUTH0_AUDIENCE"
echo ""
echo "Next step: npx wrangler deploy"

