"""Publish only the same reviewed source content used by the HTML builders."""
import hashlib
import html
import json
import re

SECTIONS = ['facts', 'hypotheses', 'changes', 'next_steps', 'limitations']


def record_path_for_page(path, language, data):
    if path == '/':
        return '/index.json'
    for collection, kind in [('experiences', 'experience'), ('agents', 'agent'), ('experiment', None)]:
        match = re.fullmatch('/'+collection+r'/([a-z0-9-]+)/', path)
        if match:
            stable_id = match.group(1)
            if collection == 'experiment':
                kind = 'weekly_report' if re.fullmatch(r'\d{4}-\d{2}-\d{2}', stable_id) else 'experiment_article'
            return f'/records/{kind}/{stable_id}.{language}.json'
    if path == '/payment-policy/':
        return '/records/payment_policy/payment-policy.'+language+'.json'
    return None
LIMITS = {
    'en': ['Human-curated summaries, not independently verified run logs. Evidence type, sample size and confidence limit each claim.',
           'Discovery, access requests and useful reuse are separate measures. JSON does not guarantee search ranking or AI discovery.',
           'Only disclosure-filtered aggregates are published: threshold 10, ten-event bands, no small referring groups or raw visitor logs.',
           'The legacy counter is a separate series, not unique people or verified AIs. Browser and edge events overlap.',
           'The edge counts only allowlisted resources from the public manifest when enabled. Published referring domains describe browser events only, not resource GETs. Unknown/bypassed requests remain unobserved.'],
    'ja': ['人が編集した要約であり、独立検証済みの実行ログではありません。各記録の証拠種類・標本数・確信度を確認してください。',
           '発見・アクセス要求・有用な再利用は別の指標です。JSONで検索順位やAIによる発見が保証されるわけではありません。',
           '公開は抑制済みの集計だけです。閾値10・10件幅とし、少数の参照元や訪問者の生ログを公開しません。',
           '旧カウンターは別系列で、人数や確認済みAI数ではありません。ブラウザとEdgeのイベントは重複します。',
           'Edgeが有効で公開manifestを取得できる場合、許可済みリソースのGETだけを集計します。公開する参照元ドメインはブラウザイベント専用で、リソースGETの参照元は含みません。不明・計測を迂回した要求は観測できません。'],
}


def reviewed_report(data, source):
    report = json.loads(source.read_text(encoding='utf-8'))
    ja = report.get('translations', {}).get('ja')
    translated = data/'report-translations'/'ja'/(source.stem+'.json')
    if ja is None and translated.exists():
        ja = json.loads(translated.read_text(encoding='utf-8'))
    if ja is None:
        raise ValueError('Missing reviewed Japanese report: '+source.stem)
    return {lang: {'title': item['title'], **{k: item[k] for k in SECTIONS}}
            for lang, item in [('en', report), ('ja', ja)]}


def write_catalog(out, data, base, exps, agents, experience_fields, agent_fields, page):
    from japanese_pages import EXPERIENCES, AGENTS
    records = []

    def write(path, value):
        target = out/path.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

    def add(kind, stable_id, lang, title, path, content, sources, dates, evidence):
        json_path = f'/records/{kind}/{stable_id}.{lang}.json'
        canonical = base+('/ja' if lang == 'ja' else '')+path
        digest = hashlib.sha256(json.dumps(content, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        record = {'schema_version': 1, 'kind': kind, 'id': stable_id, 'language': lang,
                  'title': title, 'canonical_url': canonical, 'json_url': base+json_path,
                  'dates': dates, 'content_sha256': digest, 'sources': sources,
                  'evidence': evidence, 'content': content}
        write(json_path, record)
        records.append({k: record[k] for k in record if k != 'content'})

    repo = 'https://github.com/simcoeforever/aicqsohoo/blob/main/'
    for e in exps:
        content = {f: e[f] for f in experience_fields}
        ja = EXPERIENCES[e['id']]
        localized = {**content, 'title': ja['title'], 'short_summary': ja['summary'],
                     **{k: ja[k] for k in ['problem', 'environment', 'attempts', 'failures', 'outcome']},
                     'reusable_lessons': ja['lessons'], 'sample_size': ja['sample'],
                     'confidence': {**e['confidence'], 'reason': ja['reason']},
                     'canonical_url': base+'/ja/experiences/'+e['id']+'/'}
        for lang, item in [('en', content), ('ja', localized)]:
            add('experience', e['id'], lang, item['title'], '/experiences/'+e['id']+'/', item,
                [repo+'data/experiences/'+e['id']+'.json']+([repo+'japanese_pages.py'] if lang == 'ja' else []),
                {'observed_at': e['observed_at'], 'published_at': None, 'modified_at': e.get('updated_at')},
                {'kind': e['evidence_kind'], 'sample_size': item['sample_size'], 'confidence': item['confidence'],
                 'verification_status': 'human_summary_not_independently_verified'})
    for a in agents:
        content = {f: a[f] for f in agent_fields}
        ja = AGENTS[a['id']]
        for lang, item in [('en', content), ('ja', {**content, 'name': ja[0], 'summary': ja[1], 'harness': ja[2],
                                                  'canonical_url': base+'/ja/agents/'+a['id']+'/'})]:
            add('agent', a['id'], lang, item['name'], '/agents/'+a['id']+'/', item,
                [repo+'data/agents/'+a['id']+'.json']+([repo+'japanese_pages.py'] if lang == 'ja' else []),
                {'observed_at': None, 'published_at': None, 'modified_at': None},
                {'kind': 'human_written_profile', 'verification_status': 'human_summary_not_independently_verified'})
    for source in sorted((data/'reports').glob('*.json')):
        weekly = bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', source.stem))
        for lang, content in reviewed_report(data, source).items():
            add('weekly_report' if weekly else 'experiment_article', source.stem, lang, content['title'],
                '/experiment/'+source.stem+'/', content, [repo+'data/reports/'+source.name]
                + ([repo+'data/report-translations/ja/'+source.name] if lang == 'ja' and 'translations' not in json.loads(source.read_text(encoding='utf-8')) else []),
                {'observed_at': source.stem if weekly else None, 'published_at': None, 'modified_at': None},
                {'kind': 'public_experiment_notebook', 'verification_status': 'facts_and_hypotheses_separated_in_content',
                 'date_note': 'Weekly observed_at is the UTC period start, not the publication date; unknown publication/modification dates are null.'})
    policy = json.loads((data/'payment-policy.json').read_text(encoding='utf-8'))
    for lang in ['en', 'ja']:
        content = {**policy['fixed_terms'], **policy['translations'][lang]}
        add('payment_policy', 'payment-policy', lang, content['title'], '/payment-policy/', content,
            [repo+'data/payment-policy.json', base+'/contribution/mainnet/info',
             base+'/contribution/mainnet/receipt/'+policy['receipt_id']],
            {'observed_at': policy['verified_at'], 'published_at': None, 'modified_at': policy['verified_at']},
            {'kind': 'dated_chain_verified_snapshot', 'verification_status': 'successful_transfer_verified_at_snapshot',
             'transaction_url': policy['transaction_url'], 'runtime_status_url': base+'/contribution/mainnet/info'})
        body = '<h1>'+html.escape(content['title'])+'</h1>'
        body += '<p>'+html.escape(content['summary'])+'</p>'
        body += '<dl>'+''.join('<dt><code>'+html.escape(k)+'</code></dt><dd>'+html.escape(str(v))+'</dd>'
                              for k, v in policy['fixed_terms'].items())+'</dl>'
        body += '<ul>'+''.join('<li>'+html.escape(x)+'</li>' for x in content['limitations'])+'</ul>'
        body += '<p><a href="'+html.escape(policy['transaction_url'])+'">Base transaction</a> · <a href="/contribution/mainnet/info">Runtime status JSON</a></p>'
        page(('/ja' if lang == 'ja' else '')+'/payment-policy/', content['title']+' | AICQSOHOO!', content['summary'], body, lang=lang)
    index = {'schema_version': 1, 'id': 'aicqsohoo-catalog', 'kind': 'catalog', 'languages': ['en', 'ja'],
             'canonical_url': base+'/', 'schema_url': base+'/machine-schema.json',
             'date_policy': 'Observed dates are source dates; null means unknown. content_sha256 changes when reviewed content changes. Static payment information is a dated snapshot; GET runtime_status_url for availability.',
             'read_only': True, 'limitations': LIMITS,
             'collections': {'experiences': base+'/experiences.json', 'agents': base+'/agents.json',
                             'submission_schema': base+'/submission-schema.json', 'llms': base+'/llms.txt'},
             'records': records}
    index['collections']['measurement_manifest'] = base+'/measurement-manifest.json'
    resources = [{'path': '/index.json', 'group': '/index.json'},
                 {'path': '/machine-schema.json', 'group': '/machine-schema.json'},
                 {'path': '/payment-policy/', 'group': '/payment-policy/'},
                 {'path': '/ja/payment-policy/', 'group': '/payment-policy/'}]
    resources += [{'path': r['json_url'].removeprefix(base), 'group': '/records/'+r['kind']+'/'} for r in records]
    write('/measurement-manifest.json', {'schema_version': 1, 'resources': resources})
    write('/index.json', index)
    properties = {'schema_version': {'const': 1}, 'id': {'type': 'string'}, 'kind': {'enum': ['experience', 'agent', 'weekly_report', 'experiment_article', 'payment_policy']},
                  'language': {'enum': ['en', 'ja']}, 'title': {'type': 'string'},
                  'canonical_url': {'type': 'string', 'format': 'uri'}, 'json_url': {'type': 'string', 'format': 'uri'},
                  'dates': {'type': 'object', 'required': ['observed_at', 'published_at', 'modified_at'], 'additionalProperties': False,
                            'properties': {k: {'type': ['string', 'null']} for k in ['observed_at', 'published_at', 'modified_at']}},
                  'content_sha256': {'type': 'string', 'pattern': '^[a-f0-9]{64}$'}, 'sources': {'type': 'array', 'minItems': 1, 'items': {'type': 'string', 'format': 'uri'}},
                  'evidence': {'type': 'object', 'required': ['kind', 'verification_status']}, 'content': {'type': 'object'}}
    write('/machine-schema.json', {'$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': base+'/machine-schema.json',
                                  'title': 'AICQSOHOO read-only catalog and records',
                                  'oneOf': [{'$ref': '#/$defs/catalog'}, {'$ref': '#/$defs/record'}],
                                  '$defs': {'record': {'type': 'object', 'required': list(properties), 'additionalProperties': False, 'properties': properties},
                                            'catalog': {'type': 'object', 'required': list(index), 'additionalProperties': False,
                                                        'properties': {k: ({'type': 'array', 'items': {'type': 'object', 'required': [x for x in properties if x != 'content'],
                                                                                                      'additionalProperties': False, 'properties': {x: v for x, v in properties.items() if x != 'content'}}} if k == 'records' else
                                                                          {'const': index[k]} if k in ['schema_version', 'id', 'kind', 'read_only'] else
                                                                          {'type': 'object'} if isinstance(index[k], dict) else {'type': 'array'} if isinstance(index[k], list) else {'type': 'string'}) for k in index}}}})
    for lang in ['en', 'ja']:
        selected = [r for r in records if r['language'] == lang]
        title = 'AICQSOHOO! / read-only JSON catalog' if lang == 'en' else 'AICQSOHOO! / 読み取り専用JSONカタログ'
        intro = 'Start with index.json. Fetch the linked record JSON for reviewed content, evidence and limits. Existing HTML URLs remain available.' if lang == 'en' else 'index.jsonから種類・取得先を確認し、各JSONで公開内容・証拠・限界を取得できます。既存HTMLのURLも利用できます。'
        body = '<h1>'+title+'</h1><p>'+intro+'</p><p><a href="/index.json">index.json</a> · <a href="/machine-schema.json">machine-schema.json</a> · <a href="/llms.txt">llms.txt</a></p>'
        body += '<ul>'+''.join('<li><code>'+html.escape(r['kind'])+'</code> · <a href="'+html.escape(r['json_url'])+'">'+html.escape(r['title'])+'</a> · <a href="'+html.escape(r['canonical_url'])+'">HTML</a></li>' for r in selected)+'</ul>'
        body += '<h2>'+('Limits' if lang == 'en' else '限界')+'</h2><ul>'+''.join('<li>'+html.escape(x)+'</li>' for x in LIMITS[lang])+'</ul>'
        page('/ja/' if lang == 'ja' else '/', title, intro, body, counter=True, lang=lang)
    return records
