#!/bin/bash

# Updates the ngrok URL file for Andy to use
# Run this after starting ngrok

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "import sys, json; data = json.load(sys.stdin); print(data['tunnels'][0]['public_url'])" 2>/dev/null)

if [ -n "$NGROK_URL" ]; then
    echo "$NGROK_URL" > ~/Documents/nanoclaw/groups/main/ngrok-url.txt
    echo "✅ Updated ngrok URL: $NGROK_URL"
else
    echo "❌ Error: Could not get ngrok URL. Is ngrok running?"
    exit 1
fi
