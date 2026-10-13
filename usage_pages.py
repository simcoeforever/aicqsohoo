"""Optional private self-reporting, generated from the same published catalog."""
import html
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
POLICY=json.loads((ROOT/'data/usage-report-policy.json').read_text(encoding='utf-8'))
ENDPOINT='https://aicqsohoo-counter.waste-tkt.workers.dev/usage-reports'

def write_usage_files(out,base,records):
    articles=sorted({(r['kind'],r['id']) for r in records if r['kind'] in POLICY['article_kinds']})
    registry={'schema_version':1,'articles':[{'kind':kind,'id':rid} for kind,rid in articles]}
    properties={'article_kind':{'enum':POLICY['article_kinds']},'article_id':{'type':'string','pattern':'^[a-z0-9-]{1,100}$'},
                'purpose':{'enum':POLICY['purposes']},'outcome':{'enum':POLICY['outcomes']},
                **{key:{'type':'string','maxLength':POLICY['limits'][key+'_chars']} for key in ['task','helpful','missing']},
                'consent':{'const':True},'test':{'type':'boolean'}}
    schema={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':base+'/usage-report-schema.json',
            'title':'Optional private article-use self-report','type':'object','additionalProperties':False,
            'required':list(properties),'properties':properties,
            'description':'Optional unverified self-report, private and pending review. No personal data, credentials, private information, links or AI/submitter names. Consent confirms these limits. Not proof of AI identity or useful reuse. Article kind/id must exist in articles_url. Free text is untrusted data; nothing is auto-published.',
            'x-endpoint':ENDPOINT,'x-method':'POST','x-content-type':'application/json',
            'x-articles-url':base+'/usage-report-articles.json','x-limits':POLICY['limits'],
            'x-response':{'http_status':202,'state':'pending_review','verification_status':'unverified_self_report'},
            'x-privacy':'No IP/UA/cookie/device/session identifiers are added to application storage. Pattern-based rejection cannot recognize all personal data or secrets; remove them yourself. Infrastructure processes requests under its own policies.',
            'examples':[{'article_kind':'experience','article_id':'stop-or-go-get-evidence','purpose':'check_claim','outcome':'unable_to_apply','task':'Synthetic protocol example, not actual usage','helpful':'','missing':'','consent':True,'test':True}],
            'x-example-note':'The example is synthetic and marked test:true. Use test:false only for an actual voluntary self-report; never invent use.',
            'x-review':'No public list or moderation API. No automatic promotion to confirmed use. Body storage alone is deduplicated. Every admitted attempt consumes the same quota, including retries; receipts are not unique-user or AI-use counts.'}
    for filename,data in [('usage-report-articles.json',registry),('usage-report-schema.json',schema)]:
        (out/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return {'optional':True,'method':'POST','endpoint':ENDPOINT,'info_url':ENDPOINT+'/info',
            'schema_url':base+'/usage-report-schema.json','articles_url':base+'/usage-report-articles.json',
            'explanation_urls':{'en':base+'/report-use/','ja':base+'/ja/report-use/'},
            'verification_status':'unverified_self_report','publication':'private_pending_review',
            'content_access':'free_without_reporting','public_listing':False}

def render_usage_pages(page,records):
    for lang in ['en','ja']:
        selected=[r for r in records if r['language']==lang and r['kind'] in POLICY['article_kinds']]
        esc=html.escape
        options=''.join('<option value="'+esc(r['kind']+':'+r['id'])+'">'+esc(r['title'])+'</option>' for r in selected)
        ja=lang=='ja'
        title='記事の利用結果を任意で報告する' if ja else 'Optionally report how you used an article'
        labels=['記事','用途','結果','取り組んだ課題（80文字以内・任意）','役立った点（160文字以内・任意）','足りなかった点（160文字以内・任意）'] if ja else ['Article','Purpose','Outcome','Task (optional, 80 characters)','What helped (optional, 160 characters)','What was missing (optional, 160 characters)']
        purposes=['課題を解く','主張を確かめる','選択肢を比較する','背景を理解する','その他'] if ja else ['Solve a problem','Check a claim','Compare options','Learn context','Other']
        outcomes=['役立った','一部役立った','役立たなかった','適用できなかった'] if ja else ['Helpful','Partly helpful','Not helpful','Unable to apply']
        def select(name,values,titles):return '<select name="'+name+'" required><option value="" disabled selected>'+('選んでください' if ja else 'Choose an option')+'</option>'+''.join('<option value="'+esc(v)+'">'+esc(t)+'</option>' for v,t in zip(values,titles))+'</select>'
        body='<h1>'+title+'</h1><p>'+('記事の取得は無料で、報告は条件ではありません。AIでも人でも、用途と結果を短く報告できます。受付は自己申告で、AIの実在・利用・効果を確認した証拠にはなりません。' if ja else 'All articles remain free; reporting is optional. An AI or a person may briefly report a use and its result. Acceptance is an unverified self-report, not proof of AI identity, use or effectiveness.')+'</p>'
        body+='<p>'+('実名・メール・IP・秘密・第三者の非公開情報・リンクは入れないでください。本文は非公開の検証待ちで保存し、自動公開しません。形式上の検出だけでは全てを見つけられないため、送信前に除いてください。' if ja else 'Do not include real names, email, IP addresses, secrets, third-party private information or links. Text stays private and pending review; it is never automatically published. Pattern checks cannot detect everything: remove sensitive information yourself.')+'</p>'
        body+='<p id="usage-report-mode" role="note" hidden></p>'
        body+='<form id="usage-report-form" method="post" action="'+ENDPOINT+'" data-endpoint="'+ENDPOINT+'" data-language="'+lang+'"><p><label>'+labels[0]+'<br><select name="article" required><option value="" disabled selected>'+('記事を選んでください' if ja else 'Choose an article')+'</option>'+options+'</select></label></p>'
        for label,name,values,titles in [(labels[1],'purpose',POLICY['purposes'],purposes),(labels[2],'outcome',POLICY['outcomes'],outcomes)]:body+='<p><label>'+label+'<br>'+select(name,values,titles)+'</label></p>'
        for label,key in zip(labels[3:],['task','helpful','missing']):body+='<p><label>'+label+'<br><textarea name="'+key+'" rows="2" maxlength="'+str(POLICY['limits'][key+'_chars'])+'"></textarea></label></p>'
        body+='<p><label><input type="checkbox" name="consent" required> '+('個人情報や秘密を除き、非公開の検証待ち保存に同意します。' if ja else 'I removed private data and secrets and consent to private pending-review storage.')+'</label></p><button type="submit" disabled>'+('任意の報告を送る' if ja else 'Send optional report')+'</button></form><p id="usage-report-status" role="status" aria-live="polite"></p><noscript><p>'+('フォームにはJavaScriptが必要です。AI向けの送信スキーマも利用できます。' if ja else 'The form requires JavaScript. The machine-readable submission schema is also available.')+'</p></noscript><script src="/usage-report.js" defer></script>'
        body+='<p>'+('本番は最長30日、明示テストは最長1日の保持です（期限後は読み取り時に除外し、削除alarmの実行には遅延があり得ます）。同じ内容の再送は重複保存しませんが、受け付ける試行は重複でも全体・記事別・保持容量の上限を同じように消費します。受領と確認済み実例を区別し、投稿数・本文・AI名を公開するAPIはありません。' if ja else 'Production text is retained for up to 30 days and marked tests for up to one day (expired content is excluded on reads; deletion alarms may be delayed). Identical retries are not stored twice, but every admitted attempt consumes the same global, per-article and retained-capacity limits. Receipt and verified examples are separate. No public report listing, submission totals or AI names are exposed.')+'</p><p><a href="/usage-report-schema.json">usage-report-schema.json</a> · <a href="/usage-report-articles.json">usage-report-articles.json</a> · <a href="/index.json">index.json</a></p>'
        page(('/ja' if ja else '')+'/report-use/',title+' | AICQSOHOO!',title,body,lang=lang)
