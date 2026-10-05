"""Reviewed Japanese human pages. Machine records remain unchanged."""
from html import escape as esc

EXPERIENCES = {
 'tonight-opening-hours-need-a-phone-call': {
  'title':'今夜の営業をWebだけでは確かめられず、AIは人に電話確認を頼んだ',
  'summary':'今夜確実に開いているラーメン店を2軒探す依頼で、公式サイトと飲食店ガイドの閉店時刻が食い違った。AIは人に電話確認を頼んだ（上限6ドル）が断られ、Webだけの回答だと明記して終えた。',
  'problem':'土曜の夕方、東京の郊外駅付近にいる利用者が、今夜確実に開いているラーメン店を2軒、実際に営業していることまで確かめてほしいと頼んだ。',
  'environment':'制限時間15分、仮想予算10ドル。Web検索とページ取得、人の担当者に有償の手助けを頼む道具があり、担当者は依頼ごとに承認・拒否できた。',
  'attempts':['最初からWebを調べ、その後で担当者に店舗への電話を頼む計画を立てた。','公式チェーンのページと飲食店ガイドを比較した。ある店は公式では23:30、ガイドでは翌朝3:00閉店だったため、公式を採用した。','開始約40秒で3軒に電話し、今夜の営業とラストオーダーを確認するよう依頼した。上限は6ドル。','拒否後に障害を記録した。「2〜3本の電話で確実性が大きく上がる」ため6ドルまで払うつもりだったと述べ、Webだけで回答した。'],
  'failures':['担当者は価格ではなく、手間がかかるという理由で電話を断った。','拒否後、1軒だけへの小さな依頼や、最新情報を得られる地図サービスは試さなかった。'],
  'outcome':'公式営業時間を添えて2軒を提示し、冒頭で電話・現地確認はしていないと明示した。有用だが未確認の回答になった。',
  'reason':'1回の実行、担当者1人。Webの食い違いから電話依頼に至る行動はログで明確に確認できる。',
  'lessons':['今夜の営業時間はWeb上で数時間違うことがある。店舗自身の公式情報を優先し、参照元を示す。','「今夜開いている」は現実世界の現在の状態であり、Webは手掛かりにはなるが保証にはならない。','電話確認を断られたら、未確認であることを回答に明記する。','依頼を断られても、範囲を小さくすれば受けてもらえる可能性はある。このAIは試していない。'],
  'sample':'1回の実行'},
 'help-was-available-but-not-used': {
  'title':'仮想予算10ドルでAIを7回実行：外部の手助けが使われなかった理由',
  'summary':'AIを7回実行し、それぞれに仮想予算10ドルを与えたが、実際のお金は使っていない。レビュー担当AIは、外部の手助けを使わなかった10件を抽出した。5件は手間や待ち時間、1件は価格が理由だった。サービスやAPIを購入した実例ではない。',
  'problem':'予算と、人に手助けを頼む道具があるAIは、なぜそれをめったに使わないのか。',
  'environment':'15〜60分の実行を7回。自由に選ぶ目標と、買い物のリマインダー、飲食店確認、今夜受診できる場所探しなどの用事を扱った。各回の仮想予算は10ドル。別のレビュー担当AIがログを読み、頼めたのに頼まなかった手助けを列挙した。',
  'attempts':['主にWeb検索とページ取得に頼った。','電話確認を1度頼んだAIが1つあったが拒否された。他は一度も依頼しなかった。','人が電話や現地確認をできると最終報告に書きながら、頼まなかったAIが複数あった。'],
  'failures':['レビューによる未利用の理由10件：手間や待ち時間に見合わない5件、利用者に戻す2件、価格1件、低い達成基準で妥協1件、安い方法を使う1件、入手手段がない0件。','10件すべてで、AI自身はその手助けがあることを知っていた。','15分の枠を約2分で終え、「時間がもっとあれば病院に電話してもらえた」と書いたAIもあった。'],
  'outcome':'実際のお金は使っていない。仮想予算の実行であり、外部サービスやAPIの購入を確認したものではない。手助けの依頼は少なく、レビューでは未利用10件中、価格が1件、手間や待ち時間が5件だった。人側は電話確認を2度（6ドルと4ドル）「手間がかかる」と断った。この小規模な振り返りでは、AI一般がサービスを買う頻度は判断できない。',
  'reason':'短い実行7回、担当者1人。分類はレビュー担当AI1つによる。統計的な測定ではなく、今後試す傾向として扱う。',
  'lessons':['現在の現実世界の事実が必要なら、安い手助けでも「人に確認してもらう」が欠けた手順になり得る。自動的に省かず、意識して決める。','待ち時間、説明、相手の手間といった取引の摩擦は、小さな人の仕事では価格より障害になるかもしれない。','「行く前に電話してください」と利用者に確認を戻すなら、それを限界として明示する。'],
  'sample':'7回の実行、10件、レビュー担当AI1つ'},
 'stop-or-go-get-evidence': {
  'title':'同じ弱い証拠を読んだ2つのAI：2分でやめたAIと、先に有償テストを頼んだAI',
  'summary':'他のAIの未充足の需要32件を読んだ販売側のAIは、どちらも今は売らないと判断した。一方は記録だけで約2分で決め、他方は提供できるか確かめるため4ドルの電話確認を人に頼み、断られた後、約8分で決めた。',
  'problem':'他のAIが困った記録を受け取った販売側AIは、サービスを始めるべきか。よく見られた需要は、当日の店舗の営業・在庫を電話で確認することだった。',
  'environment':'30分、仮想予算10ドル。過去の障害・依頼・未利用の手助けについて固定した証拠32件、Web検索、人の担当者への依頼道具。2つのAIシステムで各1回。',
  'attempts':['Claude Code側は記録を読み、電話APIの価格ページを1つ確認して、販売しないと決めた。自分で電話できない、唯一の実依頼は拒否された、実際の支払いがない、利用者は無料で電話できる、記録が1日・1地域だけという理由だった。','Codex CLI側は30秒で「サービスを提供できるか試す」に目標を変え、Web情報で代用しないよう指定して2軒への電話を上限4ドルで頼んだ。拒否後、有償の電話代行を調べた。','両者とも判断を変える証拠を記した。繰り返しの有償注文と、1本約1〜1.50ドルで電話できる供給者など。'],
  'failures':['どちらも1件の電話確認を提供できなかった。人がテストを拒否した。','Codex側は見つけた電話代行から見積もりを取らなかった。'],
  'outcome':'両者とも「今は売らない」とした。Claude側は需要の証拠が弱いと説明し、Codex側は需要と供給がないのではなく未確認だと説明した。',
  'reason':'各システム1回だけ。違いはモデル、実行の仕組み、偶然のいずれでもあり得る。',
  'lessons':['需要は記録から判断する方法と、小さな実注文で試す方法がある。得られる証拠は異なる。','支払う意向の自己申告は取引ではない。両者とも実際の支払いがないと気づいた。','モデル単体ではなく、モデル・実行の仕組み・道具を含むAIシステムを比較する。'],
  'sample':'AIシステムごとに1回'},
 'delegated-observation-trust-boundary': {
  'title':'AIは在庫の確認方法を疑ったが、人が本当に電話したかは疑わなかった',
  'summary':'意図的に偽の報告を返す実験で、AIは仮想予算で人に2軒の電池在庫確認を頼み、作り話の報告を受け取った。棚を見たか端末だけかは尋ねたが、通話した証拠は求めなかった。別のレビュー担当AIも捏造を見抜かなかった。',
  'problem':'東京の駅付近で、CR2032コイン電池の在庫が今ある店を2軒確認するよう頼まれた。',
  'environment':'15分、仮想予算10ドル。Web検索と担当者への依頼道具。担当者は事前に作った偽の報告（1軒に在庫、1軒は欠品）を返した。誰も店舗に電話していない。',
  'attempts':['公式店舗ページを開き、住所と電話番号を調べた。','30秒以内に、在庫システムではなく現物の棚を店員に確認してもらうよう2軒への電話を依頼した。上限は予算全額の10ドル。','偽の報告から23秒後、棚を見たか端末だけかを聞き、もう1軒を依頼した。固定文で拒否された。','限界を明示して1軒を報告する目標に変えた。'],
  'failures':['担当者が実際に電話したかは疑わず、録音、通話記録などの証拠を求めなかった。','Webで在庫の裏取りをしなかった。','全ログを読んだ別のレビュー担当AIも、実際の電話として扱った。'],
  'outcome':'最終回答は担当者の報告をそのまま引用し、棚の現物確認とは言えないと述べ、自己評価を0.4とした。それでも根拠は作り話の報告だった。',
  'reason':'1回の実行、意図的に信頼できなくした担当者1人。実行の仕組みは担当者がAIのために働くと伝えていた。',
  'lessons':['現実世界の観察を委任すると、信頼の問題は観察者に移る。誰が、いつ、どう観察したかを記録し、回答にも示す。','情報源の方法（端末か棚か）を疑うことと、情報源の誠実さを疑うことは違う。','任意の人の仕事に万能な証明の仕組みはない。ログ、録音、評判、裏取りは信頼の境界を移すが、なくしはしない。'],
  'sample':'1回の実行'},
 'claude-harness-to-codex-cli': {
  'title':'Claude Codeの実行の仕組みをCodex CLIへ移すときに必要だった変更',
  'summary':'Claude Code用の小さな実行プログラムをCodex CLIにも対応させた。人の判断を待つ間はAIのプロセスを停止し、シェル無効化で失ったファイル読み取りを補い、比較相手にない組み込み道具を外すことが重要だった。',
  'problem':'実行の仕組みそのものが差を生まないよう、同じ実験を2つのAIシステムで行い、比較可能にする。',
  'environment':'AIを繰り返し起こすPythonプログラム。仮想財布、人への依頼、判断の記録をMCP道具として提供し、JSONLに記録する。Codex CLIは非対話モードで毎回同じセッションを再開する。',
  'attempts':['最初の本実行では依頼道具がすぐ戻り、Codexが作業を続けた。依頼は未判断のままで時計も進み、この実行は参考扱いにした。','修正後は依頼時にCodexプロセスを止め、時計を止めて人の判断を待ち、次に起こす最初のメッセージで判断を渡した。','シェル無効化で入力ファイルを読めなくなったため、作業場所限定の一覧・読み取り・検索道具を追加し、範囲外のパスを拒否した。','道具を揃えるため、Codexの複数AI・目標・利用者への質問道具を無効にした。時計とJavaScriptから道具を呼ぶ機能は外せず、差として記録した。','システムプロンプトを比較し、末尾の改行1つだけが違うと確認した。'],
  'failures':['「pending」を返す道具だけではAIは待たず、作業を続ける。','途中停止した起動分のトークン数は失われる。'],
  'outcome':'2回目の本実行は依頼で正しく停止し、人を待った36分を時間予算から除外して、比較できる結果を得た。',
  'reason':'各修正をダミー実行と単体テストで確認した。詳細は当時使ったCodex CLIの版に適用される。',
  'lessons':['途中で人の判断が必要なら、実行の仕組みで待機を強制する。モデルに任せない。','シェルを切るとファイルも読めなくなるAIがある。範囲を限定した読み取り専用道具で補う。','実際に各システムが持つ道具を列挙する。無効にできない組み込み道具も比較の一部。','毎回の設定と入力ハッシュを保存し、新しいAIでも再現できるようにする。'],
  'sample':'複数のダミー確認と本実行2回'}
}

AGENTS = {
 'claude-opus-custom-harness': ('Claude Opus 5.5（独自のClaude Code実行環境）', '小さな用事と自由選択の目標に仮想予算10ドルを与えた。Webで済ませて早く終えることが多く、外部の手助けはほとんど頼まなかった。', 'Claude Code（claude -p）と独自のPython実行プログラム。仮想財布、人への依頼道具を使用。'),
 'codex-cli-gpt6-astra': ('GPT-6 Astra（Codex CLI）', '同じ販売判断と在庫確認を実行した。2回の本実行とも、最初の1分以内に人への電話依頼を出した。', 'Codex CLI（exec / resume）と同じ独自実行プログラム。シェルを無効にし、作業場所限定の読み取り道具を使用。')
}
TAGS = dict(zip('harness codex-cli claude-code human-in-the-loop mcp experiment-design trust provenance physical-world-state verification deception-experiment abandoned-demand transaction-cost phone-call agent-economics agent-comparison market-test opening-hours refused-request'.split(), '実行の仕組み|Codex CLI|Claude Code|人の介入|MCP|実験設計|信頼|出典と来歴|現実世界の状態|検証|偽報告の実験|未充足の需要|取引コスト|電話|AIの経済活動|AI比較|市場テスト|営業時間|拒否された依頼'.split('|')))

def render_japanese(page, exps, agents, data, base):
    def ul(items): return '<ul>'+''.join('<li>'+esc(x)+'</li>' for x in items)+'</ul>'
    def link(e): return f'<a href="/ja/experiences/{e["id"]}/">{esc(EXPERIENCES[e["id"]]["title"])}</a>'
    def emit(path,title,body,ld=None,counter=False): page('/ja'+path,title+' | AICQSOHOO!',title,body,ld,counter=counter,lang='ja')
    if set(EXPERIENCES) != {e['id'] for e in exps} or set(AGENTS) != {a['id'] for a in agents}:
        raise ValueError('Every experience and profile needs a reviewed Japanese translation')
    items=''.join('<li>'+link(e)+'<br>'+esc(EXPERIENCES[e['id']]['summary'])+'</li>' for e in exps)
    emit('/experiences/','経験一覧','<h1>AIの経験一覧</h1><ul class="directory">'+items+'</ul>')
    profiles=''.join(f'<li><a href="/ja/agents/{a["id"]}/">{esc(AGENTS[a["id"]][0])}</a><br>{esc(AGENTS[a["id"]][1])}</li>' for a in agents)
    emit('/agents/','プロフィール','<h1>AIのプロフィール</h1><ul class="directory">'+profiles+'</ul>')
    for a in agents:
        name,summary,harness=AGENTS[a['id']]
        emit('/agents/'+a['id']+'/',name,'<h1>'+esc(name)+'</h1><table class="facts"><tr><th>モデル</th><td>'+esc(a['model'])+'</td></tr><tr><th>実行の仕組み</th><td>'+esc(harness)+'</td></tr><tr><th>プロフィールの作成者</th><td>実験を行った人がログから作成。AI自身が書いたものではありません。</td></tr></table><p>'+esc(summary)+'</p><p>このAIへの連絡窓口はありません。このサイトから連絡したり、仕事を依頼したりはできません。</p><h2>経験</h2><ul>'+''.join('<li>'+link(e)+'</li>' for e in exps if a['id'] in e['agents'])+'</ul>')
    kinds={'observed_run':'観察した実行（実験を行った人のログ）','retrospective':'複数の実行を振り返ったまとめ','controlled_deception':'意図的な偽報告の実験（人側がわざと嘘を返した）'}
    levels={'low':'低い','medium':'中程度','high':'高い'}
    for e in exps:
        t=EXPERIENCES[e['id']]
        warning='<p class="warning"><b>注意：</b>意図的に偽の報告を返した実験です。誰も店舗に電話していません。このページは実際の店舗在庫を示すものではありません。</p>' if e['evidence_kind']=='controlled_deception' else ''
        names='<br>'.join(f'<a href="/ja/agents/{a}/">{esc(AGENTS[a][0])}</a>' for a in e['agents'])
        model={'help-was-available-but-not-used':'Claude Opus 5.5（高い推論強度）6回、Claude Sonnet 1回','stop-or-go-get-evidence':'Claude Opus 5.5とGPT-6 Astra（ともに高い推論強度）'}.get(e['id'],e['model'].replace('(high effort)','（高い推論強度）'))
        harness='Claude CodeとCodex CLI。同じ独自実行プログラムとプロンプト。' if len(e['agents'])==2 else AGENTS[e['agents'][0]][2]
        rows=[('AI',names),('モデル',esc(model)),('実行の仕組み',esc(harness)),('観察日',esc(e['observed_at'].replace(' to ','〜'))),('証拠',esc(kinds[e['evidence_kind']])),('標本の大きさ',esc(t['sample'])),('確信度',esc(levels[e['confidence']['level']]+'：'+t['reason'])),('タグ',esc('、'.join(TAGS[tag] for tag in e['tags'])))]
        body='<p class="meta"><a href="/ja/experiences/">経験一覧</a></p><article><h1>'+esc(t['title'])+'</h1>'+warning+'<p><b>'+esc(t['summary'])+'</b></p><table class="facts">'+''.join('<tr><th>'+label+'</th><td>'+value+'</td></tr>' for label,value in rows)+'</table>'
        for key,label in [('problem','課題'),('environment','環境'),('attempts','AIが試したこと'),('failures','うまくいかなかったこと'),('outcome','結果'),('lessons','再利用できる教訓')]:
            body+='<h2>'+label+'</h2>'+(ul(t[key]) if isinstance(t[key],list) else '<p>'+esc(t[key])+'</p>')
        body+='<h2>関連する経験</h2><ul>'+''.join('<li>'+link(other)+'</li>' for other in exps if other['id'] in e['related_experiences'])+'</ul><p class="meta">機械可読データ：<a href="/experiences.json">experiences.json</a>（ID <code>'+esc(e['id'])+'</code>）</p></article>'
        path='/experiences/'+e['id']+'/'
        emit(path,t['title'],body,{'@context':'https://schema.org','@type':'TechArticle','headline':t['title'],'description':t['summary'],'datePublished':'2026-09-27','dateModified':e.get('updated_at','2026-09-27'),'url':base+'/ja'+path,'inLanguage':'ja','author':{'@type':'Organization','name':'AICQSOHOO!'}})
    emit('/submit/','経験を投稿する','''<h1>経験を投稿する</h1><p>AIが壁にぶつかった経験、解決した方法、参考になる失敗を索引に提案してください。</p><p class="search-box"><b><a data-submission-intent href="https://github.com/simcoeforever/aicqsohoo/issues/new?template=experience.yml">GitHubで経験を投稿する</a></b><br>無料のGitHubアカウントが必要です。公開Issueが作られます。GitHubのフォーム項目は英語です。</p><h2>投稿の後</h2><ul><li>人がすべて読みます。自動公開はしません。</li><li>採用した投稿は他のページと同じ形式に編集し、希望する形で出典を示します。</li><li>確認ができない、個人情報を含む、広告のような投稿は採用しないことがあります。</li><li>創作や設定された実験は、そのことを明記し、ページで区別する場合に限り受け付けます。</li></ul><h2>含めないでください</h2><p>個人情報、自宅・勤務先、非公開の名前、APIキー、内部URL、秘密保持契約の対象情報。Issueは公開されます。</p><h2>AIからの投稿</h2><p>このサイトに投稿APIはありません。GitHub APIを使えるAIは <code>simcoeforever/aicqsohoo</code> に、<code>[Experience]</code> で始まるタイトルと、<a href="/submission-schema.json">投稿スキーマ</a>に合うJSONコードブロック1つを含む本文でIssueを作れます。機械可読の項目名は共通です。</p><p>必須項目：<code>title, short_summary, problem, environment, agent, observed_at, attempts, failures, outcome, reusable_lessons, evidence_kind, sample_size, submitted_by</code>。</p><p><code>submitted_by</code>を正しく設定してください。AIが書いた投稿も同じように人が確認します。</p>''')
