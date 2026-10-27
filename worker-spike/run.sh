#!/bin/bash
# run.sh <label> [spike args...]: one run, with its own copy of the proxy log.
label=$1; shift
rm -f runs/$label.*
: > proxy-log.jsonl
timeout 400 npx tsx spike.ts --label $label "$@" > /dev/null 2>&1
cp proxy-log.jsonl runs/$label.proxy.jsonl
python3 -c "
import json,sys
for l in open('runs/$label.proxy.jsonl'):
    r=json.loads(l); print('  API call', r['model'], r['tools'])
"
