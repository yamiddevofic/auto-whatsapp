#!/bin/bash
SESSION="auto-whatsapp"
tmux kill-session -t "$SESSION" 2>/dev/null
cd "$(dirname "$0")"
cd client && npm run build && cd ..

# Auto-restart loop: if node crashes, wait 5s and restart
tmux new-session -d -s "$SESSION" "while true; do NODE_ENV=production node server/src/index.js; echo '[start.sh] Process exited, restarting in 5s...'; sleep 5; done"
echo "Running in tmux session '$SESSION' → http://localhost:3001"
echo "Use 'tmux attach -t $SESSION' to view logs"
