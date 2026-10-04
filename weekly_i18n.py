"""Reviewed Japanese templates, using the same data as the English report."""

def make_japanese_report(data, tests, interventions):
    coverage = {'not_started': '未開始', 'partial': '一部の期間', 'configured': '設定済み', 'not_verified': '未検証'}[data['coverage']]
    facts = [f"期間：{data['start']}以上、{data['end']}未満（UTC）。",
             f"計測範囲：{coverage}（{data['coverage']}）。これは設定についての表示であり、配信の成功や稼働時間の証明ではありません。"]
    n = data['page_views']
    facts.append(f"テストを除くブラウザのページ表示イベント：{n}–{n+9}件（10イベント幅で公開）。" if n is not None else
                 'ブラウザのページ表示件数は非公開です（10件未満で、0件の可能性もあります）。訪問者がいないという証拠ではありません。')
    n = data['submission_intents']
    facts.append(f"テストを除く投稿リンクのクリック：{n}–{n+9}件。これは投稿の意図であり、投稿完了ではありません。" if n is not None else
                 '投稿リンクのクリック件数は非公開です（10件未満で、0件の可能性もあります）。')
    n = data['resource_gets']
    facts.append(f"任意のEdge Routeで観測した、テストを除く成功したリソースGET：{n}–{n+9}件。" if n is not None else
                 'EdgeリソースGET件数は非公開または未観測です。10件未満、0件、またはRoute無効の可能性があります。')
    facts.append('ブラウザイベントとEdgeリソース取得は重なります。足し合わせたり、異なる訪問者の数とみなしたりしません。')
    facts.append('公開条件を満たす申告された参照元ドメイン（信頼できるとは限らないデータラベル、件数は非公開）：' + str(data['frequent_referrer_domains']) + '。' if data['frequent_referrer_domains'] else
                 '公開条件を満たす参照元ドメインはありません。不明な参照元や少数のグループは掲載しません。')
    facts.append('公開条件を満たす公開ページ（件数は非公開）：' + ', '.join(data['frequent_pages']) + '。' if data['frequent_pages'] else
                 '公開条件を満たす公開ページはありません。少数のページグループは掲載しません。')
    facts.append(f"条件を決めた発見テストの記録：{len(tests)}件、サイトへの引用・リンクを含むテスト：{sum(tests)}件。" if tests else
                 'この週には条件を決めた発見テストの記録がありません。ページ表示から発見されたかどうかは推測できません。')
    changes=[]
    for row in interventions:
        translation=row.get('public_summary_ja')
        text=translation.strip() if isinstance(translation,str) and translation.strip() else '原文英語・日本語訳未確認：' + row['public_summary'].strip()
        changes.append(row['at'][:10] + '：' + text)
    if not changes:
        changes=['この週のレビュー済み公開変更要約は記録されていません。変更がなかったと示すものではありません。']
    changes.append('公開基準を適用した週次集計と既存の発見実験ノートから、この記事を生成しました。アクセス変化から変更作業の実施を推測していません。')
    return {
        'title': f"週次実験記録：{data['start']}", 'facts': facts,
        'hypotheses': ['参照元ドメインは発見経路の手がかりになるかもしれません。ただし、繰り返しの表示・不明な参照元・偽装イベントがあるため、流入の帰属や因果関係は結論できません。'],
        'changes': changes,
        'next_steps': ['新しいセッションでdiscovery/queries.jsonの固定クエリを実行し、引用された場合だけでなく見つからなかった場合も記録します。意図した変更はdiscovery/interventions.jsonlに追記します。',
                       'この仕組みは有用な再利用を計測していません。別途確認できた公開の再利用証拠を記録します。投稿リンクのクリックは価値の証明ではありません。'],
        'limitations': ['任意のEdge Routeがなければ、JavaScriptなしのHTML・JSON・llms.txt取得は未観測です。Routeがある場合も、許可した成功GETの件数であり、ユニークな人数や確認されたAI数ではありません。計測の失敗・迂回や既定のgithub.io URLへの取得は観測できません。',
                        '明示的なmeasurement=testイベントは除外します。識別子を使わないため、印を付けていない運用者テストは認識できません。',
                        '運用者が報告した旧カウンターの観測値（2026-09-30に16、2026-10-04に42）は、この計測より前の値で、内訳は不明です。']}
