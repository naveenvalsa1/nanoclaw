#!/bin/bash

echo "🔍 Andy Interactive Calling - Setup Checker"
echo "=========================================="
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js installed: $(node --version)"
else
    echo "❌ Node.js NOT installed"
    echo "   Install from: https://nodejs.org/"
    exit 1
fi

# Check if in correct directory
if [ -f "interactive-call-server.js" ]; then
    echo "✅ Server file found"
else
    echo "❌ interactive-call-server.js not found"
    echo "   Make sure you're in the correct directory"
    exit 1
fi

# Check dependencies
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Dependencies not installed"
    echo "   Run: npm install"
    exit 1
fi

# Check config file
if [ -f "twilio-config.json" ]; then
    echo "✅ Twilio config found"
else
    echo "❌ twilio-config.json not found"
    exit 1
fi

# Check if server port is available
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 3000 is already in use"
    echo "   Stop other server or use different port"
else
    echo "✅ Port 3000 available"
fi

# Check Anthropic API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  ANTHROPIC_API_KEY not set"
    echo "   Set with: export ANTHROPIC_API_KEY='your-key'"
    echo "   Or edit interactive-call-server.js directly"
else
    echo "✅ ANTHROPIC_API_KEY set"
fi

# Check ngrok
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok installed: $(ngrok version)"
else
    echo "⚠️  ngrok NOT installed"
    echo "   Install from: https://ngrok.com/download"
    echo "   Or: brew install ngrok (Mac)"
fi

echo ""
echo "=========================================="
echo ""

# Summary
if command -v node &> /dev/null && [ -f "interactive-call-server.js" ] && [ -d "node_modules" ]; then
    echo "✅ Ready to start!"
    echo ""
    echo "Next steps:"
    echo "1. Start server: node interactive-call-server.js"
    echo "2. In new terminal: ngrok http 3000"
    echo "3. Update Twilio webhook with ngrok URL"
    echo "4. Test: Ask Andy to make a call!"
else
    echo "❌ Setup incomplete"
    echo "   Follow SETUP-NGROK-GUIDE.md for instructions"
fi

echo ""
