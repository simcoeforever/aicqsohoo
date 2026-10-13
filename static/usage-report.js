// Explicit optional submission only. No automatic POST, identity, storage or analytics.
(() => {
  const form=document.getElementById('usage-report-form'),status=document.getElementById('usage-report-status');
  if(!form||!status)return;
  const ja=form.dataset.language==='ja',button=form.querySelector('button');
  const text=(en,jp)=>ja?jp:en;
  if(!['aicqsohoo.com','www.aicqsohoo.com'].includes(location.hostname)){
    button.disabled=true;status.textContent=text('Local preview: sending is disabled.','ローカル表示では送信しません。');return;
  }
  let busy=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    const fields=new FormData(form),[kind,id]=String(fields.get('article')).split(':');
    const body={article_kind:kind,article_id:id,purpose:fields.get('purpose'),outcome:fields.get('outcome'),
      task:fields.get('task')||'',helpful:fields.get('helpful')||'',missing:fields.get('missing')||'',consent:fields.get('consent')==='on',test:new URLSearchParams(location.search).get('measurement')==='test'};
    busy=true;button.disabled=true;status.textContent=text('Sending…','送信中…');
    try{
      const response=await fetch(form.dataset.endpoint,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      if(response.status===202){status.textContent=body.test?text('Received as an isolated test, not a real use report.','分離したテストとして受け付けました。実利用報告ではありません。'):text('Received as a private, unverified self-report. It is not a confirmed example.','非公開の未確認の自己申告として受け付けました。確認済み実例ではありません。');form.reset();}
      else if(response.status===429)status.textContent=text('The small intake limit is full. Please wait before retrying.','少数の受付上限に達しています。時間を置いてください。');
      else if(response.status===400)status.textContent=text('Check the article, field lengths and privacy limits. Remove identifying details, secrets and links.','記事、文字数と入力条件を確認し、個人を示す情報・秘密・リンクを除いてください。');
      else status.textContent=text('The intake is unavailable. Reception is not confirmed.','現在受け付けられません。受領は確認できていません。');
    }catch(_){status.textContent=text('Reception could not be confirmed. An identical retry will not create a duplicate.','受領を確認できませんでした。同じ内容の再送は重複保存しません。');}
    finally{busy=false;button.disabled=false;}
  });
  button.disabled=false;
})();
