import {hashDomain} from 'viem';
import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {OWNER_PILOT_VERSION,OWNER_PILOT_NONCE,OWNER_PILOT_VALID_AFTER,OWNER_PILOT_PAYER} from './owner-pilot-v5.js';
const recipient='0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735';
// The page URL determines the chain. Unknown/mixed HTML never falls back to testnet.
const pagePath=location.pathname;
const pilot=/^\/(?:ja\/)?contribute\/self-test\/$/.test(pagePath);
const testnet=/^\/(?:ja\/)?contribute\/$/.test(pagePath);
const clientScript=document.currentScript;
const asset=pilot?'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913':'0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const tokenDomainName=pilot?'USD Coin':'USDC';
const network=pilot?'eip155:8453':'eip155:84532';
const chain=pilot?'0x2105':'0x14a34',chainNumber=pilot?8453:84532;
const api=pilot?'/contribution/mainnet':'/contribution';
const paymentPath=pilot?api+'/self-test':api+'/test';
const ja=document.documentElement.lang==='ja';
const button=document.getElementById('test-payment'),consent=document.getElementById('payment-consent'),status=document.getElementById('payment-status');
const message=(en,japanese)=>{status.textContent=ja?japanese:en;};
function assertPageContext(){
  if((!pilot&&!testnet)||location.pathname!==pagePath||document.querySelectorAll('#test-payment').length!==1||
    document.querySelectorAll('#payment-consent').length!==1||document.querySelectorAll('#payment-status').length!==1||
    button?.dataset.paymentMode!==(pilot?'owner-pilot-v5':'testnet')||
    clientScript?.dataset.paymentClient!=='chain-guard-v5'||
    !/^\/payment-client\.[0-9a-f]{64}\.js$/.test(new URL(clientScript.src,location.href).pathname)){
    if(button)button.disabled=true;
    if(status)message('Stopped: page and payment client versions do not match. No signature or payment requested. Reload the updated page.',
      '停止：ページと決済クライアントの世代が一致しません。署名・決済は要求しません。更新済みページを読み直してください。');
    throw Error('payment_page_version_mismatch');
  }
}
assertPageContext();
const key=pilot?'aicqsohoo-owner-mainnet-v5-payment-id':'aicqsohoo-test-payment-id';
let id;try{id=sessionStorage.getItem(key);}catch(_){}
if(!(pilot?/^main5_[a-zA-Z0-9_-]{16,59}$/:/^pay_[a-zA-Z0-9_-]{16,60}$/).test(id||''))id=null;
let enabled=false,busy=false,terminal=false;
if(pilot){try{terminal=sessionStorage.getItem(key+'-submitted')==='1';}catch(_){}}
const update=()=>button.disabled=!enabled||!consent.checked||busy||terminal;
const providers=[];
window.addEventListener('eip6963:announceProvider',event=>{if(event.detail?.info?.rdns==='io.rabby'||event.detail?.provider?.isRabby)providers.push(event.detail.provider);});
window.dispatchEvent(new Event('eip6963:requestProvider'));
consent.addEventListener('change',update);
function showReceipt(data){
  if(!data||data.id!==id||!['created','settled','pending','failed'].includes(data.state)||
    (data.network!==undefined&&data.network!==network)||
    (data.state==='settled'&&(data.network!==network||!/^0x[0-9a-fA-F]{64}$/.test(data.transaction||''))))throw Error('receipt_terms');
  if(data.state==='created')return false;
  terminal=true;
  if(data.state==='settled'){
    message((pilot?'Mainnet transfer settled. Receipt ID: ':'Test settled. Receipt ID: ')+id,(pilot?'本番送金が決済済み。受領ID：':'テスト決済済み。受領ID：')+id);
    if(/^0x[0-9a-fA-F]{64}$/.test(data.transaction||'')){const link=document.createElement('a');link.href=(pilot?'https://basescan.org/tx/':'https://sepolia.basescan.org/tx/')+data.transaction;link.textContent=ja?(pilot?'Base本番で確認':'Base Sepoliaで確認'):(pilot?'View on Base mainnet':'View on Base Sepolia');status.append(document.createElement('br'),link);}
  }else if(data.state==='pending')message('Outcome pending. Do not sign or pay again. Keep this receipt ID: '+id,'結果確認中です。再署名・再送金せず、この受領IDを保管してください：'+id);
  else message('This attempt failed. Do not automatically retry payment. Receipt ID: '+id,'この試行は失敗しました。自動で再決済せず、受領IDを保管してください：'+id);
  if(data.diagnostic?.provider_reason&&/^[a-z_]{1,80}$/.test(data.diagnostic.provider_reason)){status.append(document.createElement('br'),document.createTextNode((ja?'拒否理由: ':'Provider reason: ')+data.diagnostic.provider_reason));}
  update();return true;
}
fetch(api+'/info',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}).then(r=>r.json()).then(async info=>{
  enabled=info.enabled===true&&info.network===network&&info.asset===asset&&info.amount_atomic==='10000'&&info.recipient===recipient&&(!pilot||(info.owner_only===true&&info.payer===OWNER_PILOT_PAYER&&info.general_contributions_enabled===false&&info.generation===5&&info.pre_sign_balance_check===true&&info.pre_sign_domain_check===true&&info.token_domain_name===tokenDomainName&&info.token_domain_version==='2'&&info.token_decimals===6&&info.terms_version===OWNER_PILOT_VERSION&&info.authorization_nonce===OWNER_PILOT_NONCE&&info.authorization_valid_after===OWNER_PILOT_VALID_AFTER));
  if(!enabled)message('Test payments are currently disabled.','現在、テスト決済は停止しています。');
  else message('Ready. Nothing happens until you confirm and press the test button.','準備できました。確認してテストボタンを押すまで、接続・署名はしません。');
  if(id){const existing=await fetch(api+'/receipt/'+id,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});if(existing.ok)showReceipt(await existing.json());else if(pilot&&terminal)message('Submission outcome unknown. Do not sign or pay again. Receipt: '+id,'送信結果が不明です。再署名・再支払いせず受領IDを保管してください：'+id);}update();
}).catch(()=>{message('Payment information is unavailable. No payment was attempted.','決済情報を取得できません。決済は行っていません。');update();});
button.addEventListener('click',async()=>{
  if(!enabled||!consent.checked||busy||terminal)return;
  busy=true;update();
  if(!id){id=(pilot?'main5_':'pay_')+crypto.randomUUID();try{sessionStorage.setItem(key,id);}catch(_){}}
  let signedSubmitted=false;
  try{
    assertPageContext();
    const body={id,terms_version:pilot?OWNER_PILOT_VERSION:'test-contribution-v1',consent:true,owner_authorized:true};
    const options={method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    const challengeResponse=await fetch(paymentPath,options),challenge=await challengeResponse.json();
    if(challengeResponse.status!==402){if(!showReceipt(challenge))message('The test could not start (paused, quota or service unavailable). No signature was requested.','停止・上限・サービス状態により開始できません。署名は求めていません。');return;}
    const terms=challenge.accepts?.[0];
    if(challenge.x402Version!==2||!Array.isArray(challenge.accepts)||challenge.accepts.length!==1||terms?.scheme!=='exact'||terms.network!==network||terms.asset!==asset||terms.amount!=='10000'||terms.payTo!==recipient||terms.maxTimeoutSeconds!==300||terms.extra?.name!==tokenDomainName||terms.extra?.version!=='2'||terms.extra?.assetTransferMethod)throw Error('terms');
    const provider=providers[0]||window.ethereum?.providers?.find(p=>p.isRabby)||(window.ethereum?.isRabby?window.ethereum:null);
    if(!provider){message('Rabby browser extension was not found. No payment was attempted.','Rabbyブラウザ拡張が見つかりません。決済は行っていません。');return;}
    message(pilot?'Check the fixed owner account and Base mainnet in Rabby.':'Check the account and Base Sepolia in Rabby.',pilot?'Rabbyで指定本人アカウントとBase本番を確認してください。':'RabbyでアカウントとBase Sepoliaを確認してください。');
    const accounts=await provider.request({method:'eth_requestAccounts'});const address=accounts[0];
    if(pilot&&address?.toLowerCase()!==OWNER_PILOT_PAYER.toLowerCase()){message('Only the fixed payer account may run this transfer. No signature requested.','指定した支払元アカウントだけが送金できます。署名は要求していません。');return;}
    if(await provider.request({method:'eth_chainId'})!==chain)await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chain}]});
    if(await provider.request({method:'eth_chainId'})!==chain)throw Error('chain');
    const signer={address,signTypedData:async args=>{
      assertPageContext();
      if(Number(args.domain.chainId)!==chainNumber||args.domain.verifyingContract?.toLowerCase()!==asset.toLowerCase()||args.message.to?.toLowerCase()!==recipient.toLowerCase()||args.message.from?.toLowerCase()!==address.toLowerCase()||String(args.message.value)!=='10000'||args.domain.name!==tokenDomainName||args.domain.version!=='2'||args.primaryType!=='TransferWithAuthorization')throw Error('signing_terms');
      if(pilot&&(args.message.from?.toLowerCase()!==OWNER_PILOT_PAYER.toLowerCase()||args.domain.name!==tokenDomainName||args.domain.version!=='2'))throw Error('owner_signing_terms');
      if(await provider.request({method:'eth_chainId'})!==chain||
        (await provider.request({method:'eth_accounts'}))?.[0]?.toLowerCase()!==address.toLowerCase())throw Error('wallet_changed_before_signature');
      if(pilot){
        // Fixed owner/token on the already checked Base chain. Read only; never
        // store or transmit the returned balance. No approvals or gas requests.
        let balance;
        try{balance=await provider.request({method:'eth_call',params:[{
          to:asset,data:'0x70a08231'+OWNER_PILOT_PAYER.slice(2).toLowerCase().padStart(64,'0')
        },'latest']});}catch(_){throw Error('balance_unavailable');}
        if(typeof balance!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(balance))throw Error('balance_unavailable');
        if(BigInt(balance)<10000n)throw Error('balance_insufficient');
        let onchainDomain;try{onchainDomain=await provider.request({method:'eth_call',params:[{to:asset,data:'0x3644e515'},'latest']});}catch(_){throw Error('domain_unavailable');}
        const expectedDomain=hashDomain({domain:args.domain,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]}});
        if(typeof onchainDomain!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(onchainDomain)||onchainDomain.toLowerCase()!==expectedDomain.toLowerCase())throw Error('domain_mismatch');
        if(await provider.request({method:'eth_chainId'})!==chain||
          (await provider.request({method:'eth_accounts'}))?.[0]?.toLowerCase()!==OWNER_PILOT_PAYER.toLowerCase())throw Error('wallet_changed_before_signature');
      }
      // Generation fields are signed by Rabby and mirrored in the returned SDK
      // authorization below. The old generation always signed validAfter=0.
      if(pilot){args.message.nonce=OWNER_PILOT_NONCE;args.message.validAfter=BigInt(OWNER_PILOT_VALID_AFTER);const now=Math.floor(Date.now()/1000);if(BigInt(args.message.validAfter)>=BigInt(now)||BigInt(args.message.validBefore)<=BigInt(now)||BigInt(args.message.validBefore)>BigInt(now+300))throw Error('authorization_time');}
      message(pilot?'Review the 0.01 REAL USDC transfer on Base mainnet. You choose whether to sign.':'Review the 0.01 test USDC authorization in Rabby. You choose whether to sign.',pilot?'RabbyでBase本番・0.01実USDCの送金承認を確認し、署名するか判断してください。':'Rabbyで0.01 test USDCの送金承認を確認し、署名するか判断してください。');
      const typed={...args,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],...args.types}};
      const data=JSON.stringify(typed,(_,value)=>typeof value==='bigint'?value.toString():value);
      return provider.request({method:'eth_signTypedData_v4',params:[address,data]});
    }};
    const client=new x402Client().register(network,new ExactEvmScheme(signer));
    const payload=await client.createPaymentPayload(challenge);
    if(pilot){payload.payload.authorization.nonce=OWNER_PILOT_NONCE;payload.payload.authorization.validAfter=OWNER_PILOT_VALID_AFTER;}
    assertPageContext();
    if(payload.accepted?.network!==network||payload.accepted?.asset!==asset||payload.accepted?.payTo!==recipient||payload.accepted?.amount!=='10000'||
      payload.payload?.authorization?.from?.toLowerCase()!==address.toLowerCase()||payload.payload?.authorization?.to?.toLowerCase()!==recipient.toLowerCase()||String(payload.payload?.authorization?.value)!=='10000')throw Error('signed_payload_terms');
    payload.extensions['payment-identifier'].info.id=id;
    message('Submitting the signed test authorization once.','署名済みのテスト承認を1回だけ送信します。');
    signedSubmitted=true;
    if(pilot){terminal=true;try{sessionStorage.setItem(key+'-submitted','1');}catch(_){}}
    const result=await fetch(paymentPath,{...options,headers:{...options.headers,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)}});
    const receipt=await result.json();if(!showReceipt(receipt)){
      terminal=true;message('Outcome unknown. Do not sign/pay again; check receipt '+id,'結果が不明です。再署名・再決済せず、受領IDを確認してください：'+id);
    }
  }catch(error){
    if(signedSubmitted){terminal=true;message('Outcome unknown. Do not sign/pay again. Receipt ID: '+id,'結果が不明です。再署名・再決済せず、受領IDを保管してください：'+id);}
    else if(error?.message==='balance_insufficient')message('Stopped: Base mainnet official USDC is below 0.01. No signature or payment submitted.','停止：Base本番の公式USDCが0.01未満です。署名要求・決済送信はしていません。');
    else if(error?.message==='domain_mismatch'||error?.message==='domain_unavailable')message('Stopped: the official USDC signing domain could not be confirmed. No signature or payment submitted.','停止：公式USDCの署名ドメインを確認できません。署名要求・決済送信はしていません。');
    else if(error?.message==='authorization_time')message('Stopped: authorization time is invalid or expired. No signature or payment submitted.','停止：送金承認の期限が不正または期限切れです。署名要求・決済送信はしていません。');
    else if(error?.message==='balance_unavailable')message('Stopped: the fixed USDC balance could not be confirmed. No signature or payment submitted.','停止：指定USDCの残高を確認できません。署名要求・決済送信はしていません。');
    else message('Stopped before submission. Check Rabby/network or retry only if you choose.','署名済み承認の送信前に停止しました。Rabby・ネットワークを確認してください。');
  }finally{busy=false;update();}
});
