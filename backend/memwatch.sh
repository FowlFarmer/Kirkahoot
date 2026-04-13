#!/bin/bash
# Watch total RAM used by node + chromium processes every 3 seconds
INTERVAL=${1:-3}
while true; do
  TOTAL=$(ps aux | grep -E 'node|puppeteer' | grep -v grep | awk '{sum+=$6} END {printf "%.1f", sum/1024}')
  NODE=$(ps aux | grep 'node' | grep -v grep | awk '{sum+=$6} END {printf "%.1f", sum/1024}')
  CHROM=$(ps aux | grep -i 'puppeteer' | grep -v grep | awk '{sum+=$6} END {printf "%.1f", sum/1024}')
  echo "$(date '+%H:%M:%S')  total=${TOTAL}MB  node=${NODE}MB  puppeteer-chrome=${CHROM}MB"
  sleep "$INTERVAL"
done
