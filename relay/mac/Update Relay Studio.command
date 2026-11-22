#!/bin/bash
# Double-click this file in Finder.
cd "$(dirname "$0")/.." && ./relay.sh update
echo
read -n 1 -s -r -p "Press any key to close this window."
