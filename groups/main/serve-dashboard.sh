#!/bin/bash
# Simple HTTP server for dashboard
# Works both inside container (/workspace/group) and on host Mac
if [ -d "/workspace/group" ]; then
    DIR="/workspace/group"
else
    DIR="$(cd "$(dirname "$0")" && pwd)"
fi
cd "$DIR"
echo "Starting dashboard server from: $DIR"
echo "Open: http://localhost:8888/andy-dashboard-no-login.html"
echo ""
python3 -m http.server 8888
