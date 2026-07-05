#!/data/data/com.termux/files/usr/bin/bash
# Auto-start Shadow Realms Bot on Termux boot
termux-wake-lock
cd /data/data/com.termux/files/home/shadow-realms-bot
pm2 resurrect 2>/dev/null || pm2 start index.js --name shadow-realms --max-memory-restart 500M --cron-restart "0 */6 * * *"
pm2 save
