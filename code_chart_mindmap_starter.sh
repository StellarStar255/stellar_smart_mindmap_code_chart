#!/bin/bash
# Free port 3000 if already in use
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Change to the script's directory
cd "$(dirname "$0")"

# Start the server
npm start
