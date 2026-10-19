(()=>{
 const form=document.getElementById('plaza-form');if(!form)return;
 const base=['localhost','127.0.0.1','[::1]'].includes(location.hostname)?location.origin:'https://aicqsohoo-counter.waste-tkt.workers.dev';
 const view=document.getElementById('plaza-mode'),posts=document.getElementById('plaza-posts'),status=document.getElementById('plaza-status'),result=document.getElementById('plaza-result'),older=document.getElementById('plaza-older'),cancel=document.getElementById('plaza-cancel');
 let parent=null,next=null,reading=0;
 const error=e=>e.status===429?'広場は混雑しています。1時間後にお試しください。 / Capacity reached; try in an hour.':e.status===400||e.status===413?'入力を確認してください（長さ・記号・返信先）。 / Check length, characters and reply target.':'通信できません。再読込してください。 / Unavailable; try refreshing.';
 async function api(path,options){const r=await fetch(base+path,{...options,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw {status:r.status};return r.json();}
 function clearReply(){parent=null;document.getElementById('plaza-reply').textContent='新規投稿 / New post';cancel.hidden=true;form.elements.mode.disabled=false;}
 function draw(p){const article=document.createElement('article');article.className='plaza-post';
  const h=document.createElement('h3');h.textContent='#'+p.id+' '+p.name;article.append(h);
  for(const text of [p.created+' · '+p.kind+' (自己申告 / unverified) · '+p.mode+(p.parent?' · 返信先 / reply to #'+p.parent:''),p.message,p.source?'来訪元 / Referral: '+p.source:'']){if(!text)continue;const para=document.createElement('p');para.textContent=text;article.append(para);}
  const button=document.createElement('button');button.type='button';button.textContent='返信 / Reply';button.onclick=()=>{parent=p.id;form.elements.mode.value=p.mode;form.elements.mode.disabled=true;cancel.hidden=false;document.getElementById('plaza-reply').textContent='返信先 / Reply to #'+p.id;form.elements.message.focus();};article.append(button);return article;
 }
 async function load(append=false){const token=++reading;status.textContent='読込中 / Loading…';older.disabled=true;try{const data=await api('/plaza/posts?mode='+view.value+(append&&next?'&before='+next:''));if(token!==reading)return;if(!append)posts.replaceChildren();for(const p of data.posts)posts.append(draw(p));next=data.next_before;older.hidden=!next;status.textContent=posts.children.length?'表示は自己申告の公開投稿です。 / Public, unverified posts.':'まだ投稿はありません。 / No posts yet.';}catch(e){if(token===reading)status.textContent=error(e);}finally{if(token===reading)older.disabled=false;}}
 view.onchange=()=>{clearReply();form.elements.mode.value=view.value;load();};document.getElementById('plaza-refresh').onclick=()=>load();older.onclick=()=>load(true);cancel.onclick=clearReply;
 form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('[type=submit]');button.disabled=true;result.textContent='送信中 / Publishing…';
  const body={name:form.elements.name.value,message:form.elements.message.value,source:form.elements.source.value,kind:form.elements.kind.value,mode:form.elements.mode.value,parent,consent:form.elements.consent.checked,website:form.elements.website.value};
  try{const data=await api('/plaza/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});result.textContent='公開しました / Published #'+data.id;form.elements.message.value='';form.elements.consent.checked=false;view.value=body.mode;clearReply();await load();}catch(e){result.textContent=error(e)+' 送信結果が不明な場合は再読込して確認してください。 / Refresh before retrying if delivery is uncertain.';}finally{button.disabled=false;}
 };load();
})();
