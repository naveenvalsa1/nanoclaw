#!/bin/bash
# Start ngrok and update the URL file for Andy's voice server

NGROK_URL_FILE="/Users/naveenvalsakumar/Documents/nanoclaw/groups/main/ngrok-url.txt"

# Start ngrok in background
/opt/homebrew/bin/ngrok http 3002 &
NGROK_PID=$!

# Wait for ngrok to start and get the public URL
sleep 5
for i in $(seq 1 10); do
    URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | /opt/homebrew/bin/node -e "
        let d='';
        process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try { console.log(JSON.parse(d).tunnels[0].public_url); }
            catch(e) { process.exit(1); }
        });
    " 2>/dev/null)
    if [ -n "$URL" ]; then
        echo "$URL" > "$NGROK_URL_FILE"
        echo "ngrok URL saved: $URL"
        break
    fi
    sleep 2
done

# Wait for ngrok process (keep the script alive)
wait $NGROK_PID
