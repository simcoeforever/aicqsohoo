#!/usr/bin/env python3
"""Generate one bounded Data Studio statement. Never connects or executes SQL."""
import argparse

MODES = ('visit', 'invited', 'test')

def generate_sql(post_id, mode, action='inspect'):
    if type(post_id) is not int or not 1 <= post_id <= 9007199254740991:
        raise ValueError('A positive safe integer post ID is required')
    if mode not in MODES or action not in ('inspect', 'hide', 'restore'):
        raise ValueError('Invalid mode or action')
    target = f"id = {post_id} AND mode = '{mode}'"
    if action == 'inspect':
        return f'SELECT id, mode, created, hidden, payload FROM plaza_posts WHERE {target} LIMIT 1;'
    value, expected = (1, 0) if action == 'hide' else (0, 1)
    return (f'UPDATE plaza_posts SET hidden = {value} WHERE {target} AND hidden = {expected} '
            'RETURNING id, mode, hidden;')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('post_id', type=int)
    parser.add_argument('--mode', required=True, choices=MODES)
    parser.add_argument('--action', choices=('inspect', 'hide', 'restore'), default='inspect')
    args = parser.parse_args()
    try:
        print(generate_sql(args.post_id, args.mode, args.action))
    except ValueError as error:
        parser.error(str(error))

if __name__ == '__main__':
    main()
