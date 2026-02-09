#!/bin/bash

# Quick start script for interactive calling server

echo "🚀 Starting Interactive Calling Server..."
echo ""
echo "This server enables Andy to have two-way conversations during calls."
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if Anthropic API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  WARNING: ANTHROPIC_API_KEY environment variable not set"
    echo "   The server will start but AI responses won't work without it."
    echo ""
    echo "   Set it with: export ANTHROPIC_API_KEY='your-key-here'"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "✅ Starting server on port 3000..."
echo ""
echo "📝 Next steps:"
echo "   1. In another terminal, run: ngrok http 3000"
echo "   2. Copy the ngrok HTTPS URL"
echo "   3. Update Twilio webhook to: https://YOUR-NGROK-URL.ngrok.io/voice/incoming"
echo "   4. Make a test call!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the server
node interactive-call-server.js
