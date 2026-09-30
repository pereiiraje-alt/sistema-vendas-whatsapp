const {authUser,serviceFetch,decrypt}=require('../lib/mercadopago');

const PAYMENT_LIMIT_MS=10*60*1000;

function mapStatus(status){
  if(status==='approved')return 'paid';
  if(status==='in_process'||status==='in_mediation')return 'processing';
  if(status==='pending'||status==='authorized')return 'pending';
  if(status==='cancelled')return 'cancelled';
  if(status==='refunded'||status==='charged_back')return 'refunded';
  return 'failed';
}

async function getPaymentById(accessToken,paymentId){
  const response=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{
    headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||'Não foi possível consultar o pagamento no Mercado Pago.');
  return data;
}

async function searchPayment(accessToken,externalReference){
  const response=await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`,{
    headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||'Não foi possível localizar o pagamento no Mercado Pago.');
  const results=Array.isArray(data.results)?data.results:[];
  return results.find(item=>item?.status==='approved')||results[0]||null;
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão do participante necessária.'});
    const user=await authUser(token);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const lotId=String(body.lotId||'').trim();
    const providerPaymentId=String(body.providerPaymentId||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(lotId))return res.status(400).json({error:'Lote inválido.'});

    const arremates=await serviceFetch(`/rest/v1/arremates?lot_id=eq.${encodeURIComponent(lotId)}&select=id,company_id,participant_id,created_at&limit=1`);
    const arremate=Array.isArray(arremates)?arremates[0]:null;
    if(!arremate)return res.status(404).json({error:'Arremate não encontrado.'});

    const participants=await serviceFetch(`/rest/v1/participants?auth_user_id=eq.${encodeURIComponent(user.id)}&company_id=eq.${encodeURIComponent(arremate.company_id)}&select=id&limit=1`);
    const participant=Array.isArray(participants)?participants[0]:null;
    if(!participant||participant.id!==arremate.participant_id)return res.status(403).json({error:'Somente o arrematante pode consultar este pagamento.'});

    let rows=await serviceFetch(`/rest/v1/payments?arremate_id=eq.${encodeURIComponent(arremate.id)}&select=id,company_id,status,method,amount,checkout_url,provider_payment_id,paid_at,updated_at&limit=1`);
    let payment=Array.isArray(rows)?rows[0]:null;
    const deadline=new Date(new Date(arremate.created_at).getTime()+PAYMENT_LIMIT_MS).toISOString();
    if(!payment)return res.status(200).json({payment:null,paymentDeadline:deadline,expired:Date.now()>=new Date(deadline).getTime()});

    if(payment.status!=='paid'&&payment.status!=='cancelled'){
      const connections=await serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(arremate.company_id)}&active=eq.true&select=access_token_encrypted&limit=1`);
      const connection=Array.isArray(connections)?connections[0]:null;
      if(connection?.access_token_encrypted){
        const accessToken=decrypt(connection.access_token_encrypted);
        let mp=null;
        if(providerPaymentId){
          try{mp=await getPaymentById(accessToken,providerPaymentId)}catch(error){console.error('payment-status direct lookup',error)}
        }
        if(!mp)mp=await searchPayment(accessToken,payment.id);
        if(mp){
          const internalId=String(mp.external_reference||mp.metadata?.payment_id||'');
          if(internalId===payment.id){
            const status=mapStatus(String(mp.status||''));
            const update={status,provider_payment_id:String(mp.id||providerPaymentId||payment.provider_payment_id||''),updated_at:new Date().toISOString()};
            if(status==='paid')update.paid_at=mp.date_approved||new Date().toISOString();
            const updated=await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}`,{
              method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(update)
            });
            payment=Array.isArray(updated)?updated[0]:payment;
          }
        }
      }
    }

    const expired=Date.now()>=new Date(deadline).getTime();
    if(expired&&payment.status!=='paid'&&payment.status!=='cancelled'){
      const updated=await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}`,{
        method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'cancelled',updated_at:new Date().toISOString()})
      });
      payment=Array.isArray(updated)?updated[0]:{...payment,status:'cancelled'};
    }

    return res.status(200).json({payment,paymentDeadline:deadline,expired:payment.status!=='paid'&&Date.now()>=new Date(deadline).getTime()});
  }catch(error){
    console.error('payment-status',error);
    return res.status(500).json({error:error.message||'Não foi possível verificar o pagamento.'});
  }
};