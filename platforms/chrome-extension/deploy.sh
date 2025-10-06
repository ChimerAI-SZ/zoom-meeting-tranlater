#!/bin/bash
# BabelAI Chrome Extension - Quick Deploy Script

echo "🚀 BabelAI WebSocket Auth Proxy Deployment"
echo "=========================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "📦 Installing wrangler CLI..."
    npm install -g wrangler
fi

echo "🔑 Logging in to Cloudflare..."
wrangler login

echo "⚡ Deploying Worker..."
wrangler deploy

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "Next steps:"
echo "1. Copy the Worker URL shown above"
echo "2. Open Chrome Extension popup"
echo "3. Paste the URL in 'Worker URL' field"
echo "4. Save config and start using!"
echo ""