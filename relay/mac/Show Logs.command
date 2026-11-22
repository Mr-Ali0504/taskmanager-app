#!/bin/bash
# Double-click this file in Finder: opens the logs folder and shows the latest lines.
cd "$(dirname "$0")/.." && mkdir -p logs && open logs
./relay.sh status
echo
echo "---- last 40 lines of logs/app.log ----"
tail -n 40 logs/app.log 2>/dev/null || echo "(no log yet)"
echo
read -n 1 -s -r -p "Press any key to close this window."
