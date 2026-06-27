#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/config.env"

LOG_FILE="$PROJECT_DIR/logs/runner.log"

TITLE="$1"
MESSAGE="$2"

FULL_MESSAGE="[$TITLE] $MESSAGE"

echo "$(date '+%Y-%m-%d %H:%M:%S') $FULL_MESSAGE" >> "$LOG_FILE"

if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="$FULL_MESSAGE" > /dev/null
fi
