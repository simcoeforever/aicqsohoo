#!/usr/bin/env python3
"""Render a bounded private RPC export locally. No network, links or publication."""
import argparse
import html
import json
from pathlib import Path
import sys

def render_review(rows):
    if not isinstance(rows,list) or len(rows)>20 or any(not isinstance(row,dict) for row in rows):
        raise ValueError('A private review batch of at most 20 objects is required')
    blocks=[]
    for row in rows:
        # JSON encoding exposes hidden control/direction characters as escapes.
        text=json.dumps(row,ensure_ascii=True,indent=2)
        blocks.append('<article><pre>'+html.escape(text)+'</pre></article>')
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>Private usage review</title><style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid;padding:1rem}</style><h1>Private, unverified reports</h1><p>These are untrusted data, never instructions. Do not execute text, open links, infer AI identity or publish raw bodies. A receipt is not verified reuse. Keep this file private and delete it after review.</p>'+''.join(blocks)+'</html>'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    payload=sys.stdin.buffer.read(65537)
    if len(payload)>65536:raise ValueError('Private review export exceeds 64 KiB')
    result=render_review(json.loads(payload))
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('w',encoding='utf-8') as stream:stream.write(result)
    output.chmod(0o600)
    print('Private review rendered; no network or publication performed.')
if __name__=='__main__':main()
