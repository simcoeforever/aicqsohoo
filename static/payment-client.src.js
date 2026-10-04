import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {encodePaymentSignatureHeader} from '@x402/core/http';
const recipient='0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735';
const asset='0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const network='eip155:84532';
const ja=document.documentElement.lang==='ja';
const button=document.getElementById('test-payment'),consent=document.getElementById('payment-consent'),status=document.getElementById('payment-status');
const message=(en,japanese)=>{status.textContent=ja?japanese:en;};
const key='aicqsohoo-test-payment-id';
let id;try{id=sessionStorage.getItem(key);}catch(_){}
if(!/^pay_[a-zA-Z0-9_-]{16,60}$/.test(id||''))id=null;
let enabled=false,busy=false,terminal=false;
const update=()=>button.disabled=!enabled||!consent.checked||busy||terminal;
const providers=[];
window.addEventListener('eip6963:announceProvider',event=>{if(event.detail?.info?.rdns==='io.rabby'||event.detail?.provider?.isRabby)providers.push(event.detail.provider);});
window.dispatchEvent(new Event('eip6963:requestProvider'));
consent.addEventListener('change',update);
function showReceipt(data){
  if(data.state==='created')return false;
  terminal=true;
  if(data.state==='settled'){
    message('Test settled. Receipt ID: '+id,'テスト決済済み。受領ID：'+id);
    if(/^0x[0-9a-fA-F]{64}$/.test(data.transaction||'')){const link=document.createElement('a');link.href='https://sepolia.basescan.org/tx/'+data.transaction;link.textContent=ja?'Base Sepoliaで確認':'View on Base Sepolia';status.append(document.createElement('br'),link);}
  }else if(data.state==='pending')message('Outcome pending. Do not sign or pay again. Keep this receipt ID: '+id,'結果確認中です。再署名・再送金せず、この受領IDを保管してください：'+id);
  else message('This attempt failed. Do not automatically retry payment. Receipt ID: '+id,'この試行は失敗しました。自動で再決済せず、受領IDを保管してください：'+id);
  update();return true;
}
fetch('/contribution/info',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}).then(r=>r.json()).then(async info=>{
  enabled=info.enabled===true&&info.network===network&&info.asset===asset&&info.amount_atomic==='10000'&&info.recipient===recipient;
  if(!enabled)message('Test payments are currently disabled.','現在、テスト決済は停止しています。');
  else message('Ready. Nothing happens until you confirm and press the test button.','準備できました。確認してテストボタンを押すまで、接続・署名はしません。');
  if(id){const existing=await fetch('/contribution/receipt/'+id,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});if(existing.ok)showReceipt(await existing.json());}update();
}).catch(()=>{message('Payment information is unavailable. No payment was attempted.','決済情報を取得できません。決済は行っていません。');update();});
button.addEventListener('click',async()=>{
  if(!enabled||!consent.checked||busy||terminal)return;
  busy=true;update();
  if(!id){id='pay_'+crypto.randomUUID();try{sessionStorage.setItem(key,id);}catch(_){}}
  let signedSubmitted=false;
  try{
    const body={id,terms_version:'test-contribution-v1',consent:true,owner_authorized:true};
    const options={method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    const challengeResponse=await fetch('/contribution/test',options),challenge=await challengeResponse.json();
    if(challengeResponse.status!==402){if(!showReceipt(challenge))message('The test could not start (paused, quota or service unavailable). No signature was requested.','停止・上限・サービス状態により開始できません。署名は求めていません。');return;}
    const terms=challenge.accepts?.[0];
    if(challenge.x402Version!==2||challenge.accepts.length!==1||terms.scheme!=='exact'||terms.network!==network||terms.asset!==asset||terms.amount!=='10000'||terms.payTo!==recipient||terms.maxTimeoutSeconds!==300||terms.extra?.name!=='USDC'||terms.extra?.version!=='2'||terms.extra?.assetTransferMethod)throw Error('terms');
    const provider=providers[0]||window.ethereum?.providers?.find(p=>p.isRabby)||(window.ethereum?.isRabby?window.ethereum:null);
    if(!provider){message('Rabby browser extension was not found. No payment was attempted.','Rabbyブラウザ拡張が見つかりません。決済は行っていません。');return;}
    message('Check the account and Base Sepolia in Rabby.','RabbyでアカウントとBase Sepoliaを確認してください。');
    const accounts=await provider.request({method:'eth_requestAccounts'});const address=accounts[0];
    if(await provider.request({method:'eth_chainId'})!=='0x14a34')await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});
    if(await provider.request({method:'eth_chainId'})!=='0x14a34')throw Error('chain');
    const signer={address,signTypedData:async args=>{
      if(Number(args.domain.chainId)!==84532||args.domain.verifyingContract?.toLowerCase()!==asset.toLowerCase()||args.message.to?.toLowerCase()!==recipient.toLowerCase()||String(args.message.value)!=='10000')throw Error('signing_terms');
      message('Review the 0.01 test USDC authorization in Rabby. You choose whether to sign.','Rabbyで0.01 test USDCの送金承認を確認し、署名するか判断してください。');
      const typed={...args,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],...args.types}};
      const data=JSON.stringify(typed,(_,value)=>typeof value==='bigint'?value.toString():value);
      return provider.request({method:'eth_signTypedData_v4',params:[address,data]});
    }};
    const client=new x402Client().register(network,new ExactEvmScheme(signer));
    const payload=await client.createPaymentPayload(challenge);
    payload.extensions['payment-identifier'].info.id=id;
    message('Submitting the signed test authorization once.','署名済みのテスト承認を1回だけ送信します。');
    signedSubmitted=true;
    const result=await fetch('/contribution/test',{...options,headers:{...options.headers,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)}});
    const receipt=await result.json();if(!showReceipt(receipt)){
      terminal=true;message('Outcome unknown. Do not sign/pay again; check receipt '+id,'結果が不明です。再署名・再決済せず、受領IDを確認してください：'+id);
    }
  }catch(_){
    if(signedSubmitted){terminal=true;message('Outcome unknown. Do not sign/pay again. Receipt ID: '+id,'結果が不明です。再署名・再決済せず、受領IDを保管してください：'+id);}
    else message('Stopped before submission. Check Rabby/network or retry only if you choose.','署名済み承認の送信前に停止しました。Rabby・ネットワークを確認してください。');
  }finally{busy=false;update();}
});
