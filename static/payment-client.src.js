import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {OWNER_PILOT_VERSION,OWNER_PILOT_NONCE,OWNER_PILOT_VALID_AFTER} from './owner-pilot-v2.js';
const recipient='0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735';
const pilot=document.getElementById('test-payment')?.dataset.paymentMode==='owner-pilot-v2';
const asset=pilot?'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913':'0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const network=pilot?'eip155:8453':'eip155:84532';
const chain=pilot?'0x2105':'0x14a34',chainNumber=pilot?8453:84532;
const api=pilot?'/contribution/mainnet':'/contribution';
const paymentPath=pilot?api+'/self-test':api+'/test';
const ja=document.documentElement.lang==='ja';
const button=document.getElementById('test-payment'),consent=document.getElementById('payment-consent'),status=document.getElementById('payment-status');
const message=(en,japanese)=>{status.textContent=ja?japanese:en;};
const key=pilot?'aicqsohoo-owner-mainnet-v2-payment-id':'aicqsohoo-test-payment-id';
let id;try{id=sessionStorage.getItem(key);}catch(_){}
if(!(pilot?/^main2_[a-zA-Z0-9_-]{16,59}$/:/^pay_[a-zA-Z0-9_-]{16,60}$/).test(id||''))id=null;
let enabled=false,busy=false,terminal=false;
if(pilot){try{terminal=sessionStorage.getItem(key+'-submitted')==='1';}catch(_){}}
const update=()=>button.disabled=!enabled||!consent.checked||busy||terminal;
const providers=[];
window.addEventListener('eip6963:announceProvider',event=>{if(event.detail?.info?.rdns==='io.rabby'||event.detail?.provider?.isRabby)providers.push(event.detail.provider);});
window.dispatchEvent(new Event('eip6963:requestProvider'));
consent.addEventListener('change',update);
function showReceipt(data){
  if(data.state==='created')return false;
  terminal=true;
  if(data.state==='settled'){
    message((pilot?'Mainnet self-transfer settled. No net balance increase. Receipt ID: ':'Test settled. Receipt ID: ')+id,(pilot?'本番自己送金が決済済み。残高の純増はありません。受領ID：':'テスト決済済み。受領ID：')+id);
    if(/^0x[0-9a-fA-F]{64}$/.test(data.transaction||'')){const link=document.createElement('a');link.href=(pilot?'https://basescan.org/tx/':'https://sepolia.basescan.org/tx/')+data.transaction;link.textContent=ja?(pilot?'Base本番で確認':'Base Sepoliaで確認'):(pilot?'View on Base mainnet':'View on Base Sepolia');status.append(document.createElement('br'),link);}
  }else if(data.state==='pending')message('Outcome pending. Do not sign or pay again. Keep this receipt ID: '+id,'結果確認中です。再署名・再送金せず、この受領IDを保管してください：'+id);
  else message('This attempt failed. Do not automatically retry payment. Receipt ID: '+id,'この試行は失敗しました。自動で再決済せず、受領IDを保管してください：'+id);
  update();return true;
}
fetch(api+'/info',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}).then(r=>r.json()).then(async info=>{
  enabled=info.enabled===true&&info.network===network&&info.asset===asset&&info.amount_atomic==='10000'&&info.recipient===recipient&&(!pilot||(info.owner_only===true&&info.payer===recipient&&info.general_contributions_enabled===false&&info.generation===2&&info.terms_version===OWNER_PILOT_VERSION&&info.authorization_nonce===OWNER_PILOT_NONCE&&info.authorization_valid_after===OWNER_PILOT_VALID_AFTER));
  if(!enabled)message('Test payments are currently disabled.','現在、テスト決済は停止しています。');
  else message('Ready. Nothing happens until you confirm and press the test button.','準備できました。確認してテストボタンを押すまで、接続・署名はしません。');
  if(id){const existing=await fetch(api+'/receipt/'+id,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});if(existing.ok)showReceipt(await existing.json());else if(pilot&&terminal)message('Submission outcome unknown. Do not sign or pay again. Receipt: '+id,'送信結果が不明です。再署名・再支払いせず受領IDを保管してください：'+id);}update();
}).catch(()=>{message('Payment information is unavailable. No payment was attempted.','決済情報を取得できません。決済は行っていません。');update();});
button.addEventListener('click',async()=>{
  if(!enabled||!consent.checked||busy||terminal)return;
  busy=true;update();
  if(!id){id=(pilot?'main2_':'pay_')+crypto.randomUUID();try{sessionStorage.setItem(key,id);}catch(_){}}
  let signedSubmitted=false;
  try{
    const body={id,terms_version:pilot?OWNER_PILOT_VERSION:'test-contribution-v1',consent:true,owner_authorized:true};
    const options={method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    const challengeResponse=await fetch(paymentPath,options),challenge=await challengeResponse.json();
    if(challengeResponse.status!==402){if(!showReceipt(challenge))message('The test could not start (paused, quota or service unavailable). No signature was requested.','停止・上限・サービス状態により開始できません。署名は求めていません。');return;}
    const terms=challenge.accepts?.[0];
    if(challenge.x402Version!==2||challenge.accepts.length!==1||terms.scheme!=='exact'||terms.network!==network||terms.asset!==asset||terms.amount!=='10000'||terms.payTo!==recipient||terms.maxTimeoutSeconds!==300||terms.extra?.name!=='USDC'||terms.extra?.version!=='2'||terms.extra?.assetTransferMethod)throw Error('terms');
    const provider=providers[0]||window.ethereum?.providers?.find(p=>p.isRabby)||(window.ethereum?.isRabby?window.ethereum:null);
    if(!provider){message('Rabby browser extension was not found. No payment was attempted.','Rabbyブラウザ拡張が見つかりません。決済は行っていません。');return;}
    message(pilot?'Check the fixed owner account and Base mainnet in Rabby.':'Check the account and Base Sepolia in Rabby.',pilot?'Rabbyで指定本人アカウントとBase本番を確認してください。':'RabbyでアカウントとBase Sepoliaを確認してください。');
    const accounts=await provider.request({method:'eth_requestAccounts'});const address=accounts[0];
    if(pilot&&address?.toLowerCase()!==recipient.toLowerCase()){message('Only the fixed owner account may run this self-transfer. No signature requested.','指定した本人アカウントだけが自己送金できます。署名は要求していません。');return;}
    if(await provider.request({method:'eth_chainId'})!==chain)await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chain}]});
    if(await provider.request({method:'eth_chainId'})!==chain)throw Error('chain');
    const signer={address,signTypedData:async args=>{
      if(Number(args.domain.chainId)!==chainNumber||args.domain.verifyingContract?.toLowerCase()!==asset.toLowerCase()||args.message.to?.toLowerCase()!==recipient.toLowerCase()||String(args.message.value)!=='10000')throw Error('signing_terms');
      if(pilot&&(args.message.from?.toLowerCase()!==recipient.toLowerCase()||args.domain.name!=='USDC'||args.domain.version!=='2'))throw Error('owner_signing_terms');
      // Generation fields are signed by Rabby and mirrored in the returned SDK
      // authorization below. The old generation always signed validAfter=0.
      if(pilot){args.message.nonce=OWNER_PILOT_NONCE;args.message.validAfter=BigInt(OWNER_PILOT_VALID_AFTER);}
      message(pilot?'Review the 0.01 REAL USDC self-transfer on Base mainnet. You choose whether to sign.':'Review the 0.01 test USDC authorization in Rabby. You choose whether to sign.',pilot?'RabbyでBase本番・0.01実USDCの自己送金承認を確認し、署名するか判断してください。':'Rabbyで0.01 test USDCの送金承認を確認し、署名するか判断してください。');
      const typed={...args,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],...args.types}};
      const data=JSON.stringify(typed,(_,value)=>typeof value==='bigint'?value.toString():value);
      return provider.request({method:'eth_signTypedData_v4',params:[address,data]});
    }};
    const client=new x402Client().register(network,new ExactEvmScheme(signer));
    const payload=await client.createPaymentPayload(challenge);
    if(pilot){payload.payload.authorization.nonce=OWNER_PILOT_NONCE;payload.payload.authorization.validAfter=OWNER_PILOT_VALID_AFTER;}
    payload.extensions['payment-identifier'].info.id=id;
    message('Submitting the signed test authorization once.','署名済みのテスト承認を1回だけ送信します。');
    signedSubmitted=true;
    if(pilot){terminal=true;try{sessionStorage.setItem(key+'-submitted','1');}catch(_){}}
    const result=await fetch(paymentPath,{...options,headers:{...options.headers,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)}});
    const receipt=await result.json();if(!showReceipt(receipt)){
      terminal=true;message('Outcome unknown. Do not sign/pay again; check receipt '+id,'結果が不明です。再署名・再決済せず、受領IDを確認してください：'+id);
    }
  }catch(_){
    if(signedSubmitted){terminal=true;message('Outcome unknown. Do not sign/pay again. Receipt ID: '+id,'結果が不明です。再署名・再決済せず、受領IDを保管してください：'+id);}
    else message('Stopped before submission. Check Rabby/network or retry only if you choose.','署名済み承認の送信前に停止しました。Rabby・ネットワークを確認してください。');
  }finally{busy=false;update();}
});
