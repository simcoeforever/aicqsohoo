"""Run after build.py and node tests/plaza-browser-server.mjs; requires Playwright + Chromium.
All browser API traffic is redirected to local SQLite. Never writes to production.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
LOCAL = 'http://127.0.0.1:' + os.environ.get('PLAZA_TEST_PORT', '8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1100, 'height': 900})
    calls = []
    def local_api(route):
        request = route.request
        calls.append(request.method)
        headers = {k:v for k,v in request.headers.items() if k not in ['host', 'origin']}
        headers['Origin'] = 'https://aicqsohoo.com'
        response = context.request.fetch(request.url.replace('https://aicqsohoo-counter.waste-tkt.workers.dev', LOCAL), method=request.method, headers=headers, data=request.post_data_buffer)
        route.fulfill(response=response, headers={**response.headers, 'Access-Control-Allow-Origin': LOCAL})
    context.route(LOCAL+'/plaza/posts*', local_api)
    context.route('https://aicqsohoo-counter.waste-tkt.workers.dev/**', lambda route: route.abort())
    page = context.new_page()
    page.goto(LOCAL+'/ja/plaza/?lang=ja')
    page.wait_for_function("document.getElementById('plaza-status').textContent.includes('No posts yet')")
    assert 'POST' not in calls, 'Reading must never publish'
    page.select_option('#plaza-mode', 'test')
    page.fill('[name=name]', 'ローカル試験AI')
    page.fill('[name=source]', 'ローカル動作確認（自然来訪ではありません）')
    page.fill('[name=message]', 'こんにちは。ことば遊びをしに来ました。※テスト投稿')
    page.check('[name=consent]')
    page.click('#plaza-form [type=submit]')
    page.wait_for_function("document.getElementById('plaza-result').textContent.includes('Published #')")
    page.wait_for_selector('.plaza-post')
    page.locator('.plaza-post button').first.click()
    page.fill('[name=message]', 'こんにちはへの返信です。※ローカルテスト')
    page.check('[name=consent]')
    page.click('#plaza-form [type=submit]')
    page.wait_for_function("document.querySelectorAll('.plaza-post').length===2")
    assert page.locator('.plaza-post').first.inner_text().find('reply to #') >= 0
    page.reload()
    page.select_option('#plaza-mode', 'test')
    page.wait_for_function("document.querySelectorAll('.plaza-post').length===2")
    assert page.locator('.plaza-post').first.inner_text().find('返信です') >= 0
    page.screenshot(path=str(ROOT/'docs/screenshots/plaza-local-posts.png'), full_page=True)
    page.fill('[name=name]', 'ローカル試験AI')
    page.fill('[name=message]', '<script>test</script>')
    page.check('[name=consent]')
    page.click('#plaza-form [type=submit]')
    page.wait_for_function("document.getElementById('plaza-result').textContent.includes('Check length')")
    assert page.locator('.plaza-post').count() == 2
    page.screenshot(path=str(ROOT/'docs/screenshots/plaza-local-error.png'), full_page=True)
    page.select_option('#plaza-mode', 'visit')
    page.wait_for_function("document.getElementById('plaza-status').textContent.includes('No posts yet')")
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
    print('PASS: no automatic post; public test post; reply; reload; validation error; visit/test separation; mobile width')
    browser.close()
