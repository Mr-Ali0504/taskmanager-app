#!/bin/bash
# Double-click this file in Finder.
cd "$(dirname "$0")/.." && ./relay.sh stop
echo
read -n 1 -s -r -p "Press any key to close this window."
