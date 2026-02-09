#!/bin/bash

echo "🚀 Starting Andy Interactive Calling Server"
echo ""

# Check which version to use
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  No ANTHROPIC_API_KEY found"
    echo "📝 Starting in SIMPLE MODE (rule-based responses)"
    echo ""
    node interactive-call-server-simple.js
else
    echo "✅ ANTHROPIC_API_KEY found"
    echo "🤖 Starting in AI MODE (Claude-powered responses)"
    echo ""
    node interactive-call-server.js
fi
