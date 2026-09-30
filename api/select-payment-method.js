const {authUser,serviceFetch,decrypt}=require('../lib/mercadopago');
const PUBLIC_ORIGIN='https://jpleiloes.com.br';
const PAYMENT_LIMIT_MS=10*60*1000;

function paymentMethodRules(method){
  if(method==='pix'){
    return {excluded_payment_types:[{id:'ticket'},{id:'credit_card'},{id:'debit_card'},{id:'prepaid_card'},{id:'digital_currency'},{id:'atm'}]};
  }
  return {excluded_payment_types:[{id:'ticket'},{id:'bank_transfer'},{id:'digital_currency'},{id:'atm'}]};
}

async function createPreference(accessToken,{lot,arremate,payment,payerEmail,marketplaceFee=0,method}){
  const returnUrl=`${PUBLIC_ORIGIN}/?lote=${encodeURIComponent(lot.id)}`;
  const preference={items:[{id:String(lot.id),title:`Lote #${lot.lot_number} - ${lot.title}`,description:'Pagamento de lote arrematado na JP Leilões',quantity:1,currency_id:'BRL',unit_price:Number(payment.amount)}],payer:{email:payerEmail},external_reference:String(payment.id),back_urls:{success:`${returnUrl}&payment=success`,pending:`${returnUrl}&payment=pending`,failure:`${returnUrl}&payment=failure`},notification_url:`${PUBLIC_ORIGIN}/api/mercadopago-webhook?company_id=${encodeURIComponent(arremate.company_id)}`,auto_return:'approved',statement_descriptor:'JPLEILOES',payment_methods:paymentMethodRules(method),metadata:{payment_id:String(payment.id),arremate_id:String(arremate.id),lot_id:String(lot.id),company_id:String(arremate.company_id),platform_fee_amount:Number(marketplaceFee||0),selected_method:method}};
  if(Number(marketplaceFee)>0)preference.marketplace_fee=Number(marketplaceFee);
  const r=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(preference)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.init_point)throw new Error(data.message||data.error||'Não foi possível gerar o checkout do Mercado Pago.');
  return data;
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Faça login como participante para escolher a forma de pagamento.'});
    const user=await authUser(token);

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const lotId=String(body.lotId||'').trim();
    const method=String(body.method||'').toLowerCase();
    if(!/^[0-9a-f-]{36}$/i.test(lotId))return res.status(400).json({error:'Lote inválido.'});
    if(!['pix','card'].includes(method))return res.status(400).json({error:'Escolha PIX ou cartão.'});

    await serviceFetch('/rest/v1/rpc/finalize_lot',{method:'POST',body:JSON.stringify({p_lot_id:lotId})});
    const lots=await serviceFetch(`/rest/v1/lots?id=eq.${encodeURIComponent(lotId)}&select=id,lot_number,title,company_id&limit=1`);
    const lot=Array.isArray(lots)?lots[0]:null;
    if(!lot)return res.status(404).json({error:'Lote não encontrado.'});

    const arremates=await serviceFetch(`/rest/v1/arremates?lot_id=eq.${encodeURIComponent(lotId)}&select=id,company_id,participant_id,winning_bid,total_amount,created_at&limit=1`);
    const arremate=Array.isArray(arremates)?arremates[0]:null;
    if(!arremate)return res.status(409).json({error:'Este lote não possui arrematante.'});

    const deadline=new Date(arremate.created_at).getTime()+PAYMENT_LIMIT_MS;
    if(Date.now()>=deadline){
      const existing=await serviceFetch(`/rest/v1/payments?arremate_id=eq.${encodeURIComponent(arremate.id)}&select=id,status&limit=1`);
      const payment=Array.isArray(existing)?existing[0]:null;
      if(payment?.status!=='paid'&&payment?.id){
        await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'cancelled',updated_at:new Date().toISOString()})});
      }
      return res.status(409).json({error:'O prazo de 10 minutos para pagamento terminou. O arremate foi cancelado.'});
    }

    const participants=await serviceFetch(`/rest/v1/participants?auth_user_id=eq.${encodeURIComponent(user.id)}&company_id=eq.${encodeURIComponent(arremate.company_id)}&select=id,email&limit=1`);
    const participant=Array.isArray(participants)?participants[0]:null;
    if(!participant||participant.id!==arremate.participant_id)return res.status(403).json({error:'Somente o arrematante pode escolher a forma de pagamento.'});

    const companies=await serviceFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(arremate.company_id)}&select=plan,platform_fee_type,platform_fee_value&limit=1`);
    const company=Array.isArray(companies)?companies[0]:null;
    const amount=Number(arremate.total_amount||arremate.winning_bid||0);
    const feePercent=company?.platform_fee_type==='percentage'?Number(company.platform_fee_value||0):0;
    const marketplaceFee=feePercent>0?Number((amount*feePercent/100).toFixed(2)):0;

    const payload={company_id:arremate.company_id,arremate_id:arremate.id,provider:'mercado_pago',method,status:'pending',amount,platform_fee_amount:marketplaceFee,platform_fee_percent:feePercent,updated_at:new Date().toISOString()};
    const savedRows=await serviceFetch('/rest/v1/payments?on_conflict=arremate_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});
    let payment=Array.isArray(savedRows)?savedRows[0]:savedRows;

    const connections=await serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(arremate.company_id)}&active=eq.true&select=access_token_encrypted,token_expires_at&limit=1`);
    const connection=Array.isArray(connections)?connections[0]:null;
    if(!connection?.access_token_encrypted)return res.status(200).json({payment,onlineReady:false,message:'Forma de pagamento registrada. A empresa ainda precisa conectar o Mercado Pago.'});

    const accessToken=decrypt(connection.access_token_encrypted);
    const preference=await createPreference(accessToken,{lot,arremate,payment,payerEmail:participant.email||user.email,marketplaceFee,method});
    const updated=await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({checkout_url:preference.init_point,provider_payment_id:String(preference.id||''),updated_at:new Date().toISOString()})});
    payment=Array.isArray(updated)?updated[0]:payment;
    return res.status(200).json({payment,onlineReady:true,checkoutUrl:preference.init_point,marketplaceFee,feePercent,method,paymentDeadline:new Date(deadline).toISOString(),message:marketplaceFee>0?`Checkout gerado com comissão JP Leilões de ${feePercent}%.`:'Checkout Mercado Pago gerado com sucesso.'});
  }catch(error){
    console.error('select-payment-method',error);
    return res.status(500).json({error:error.message||'Não foi possível preparar o pagamento.'});
  }
};