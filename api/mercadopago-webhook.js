const {serviceFetch,decrypt}=require('./_mercadopago');

function mapStatus(status){
  if(status==='approved')return 'paid';
  if(status==='in_process'||status==='in_mediation')return 'processing';
  if(status==='pending'||status==='authorized')return 'pending';
  if(status==='cancelled')return 'cancelled';
  if(status==='refunded'||status==='charged_back')return 'refunded';
  return 'failed';
}

async function getConnection(companyId){
  const rows=await serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&select=access_token_encrypted&limit=1`);
  return Array.isArray(rows)?rows[0]:null;
}

async function getMercadoPagoPayment(accessToken,paymentId){
  const response=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{
    headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||'Não foi possível consultar o pagamento no Mercado Pago.');
  return data;
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'&&req.method!=='GET'){
    res.setHeader('Allow','POST, GET');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const companyId=String(req.query?.company_id||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(companyId))return res.status(200).json({ok:true});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const paymentId=String(body?.data?.id||req.query?.['data.id']||req.query?.id||'').trim();
    const type=String(body?.type||req.query?.type||req.query?.topic||'').toLowerCase();
    if(!paymentId||(!type.includes('payment')&&type!==''))return res.status(200).json({ok:true});

    const connection=await getConnection(companyId);
    if(!connection?.access_token_encrypted)return res.status(200).json({ok:true});
    const accessToken=decrypt(connection.access_token_encrypted);
    const mp=await getMercadoPagoPayment(accessToken,paymentId);
    const internalId=String(mp.external_reference||mp.metadata?.payment_id||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(internalId))return res.status(200).json({ok:true});

    const rows=await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(internalId)}&company_id=eq.${encodeURIComponent(companyId)}&select=id&limit=1`);
    if(!Array.isArray(rows)||!rows[0])return res.status(200).json({ok:true});

    const status=mapStatus(String(mp.status||''));
    const update={
      status,
      provider_payment_id:String(mp.id||paymentId),
      updated_at:new Date().toISOString()
    };
    if(status==='paid')update.paid_at=mp.date_approved||new Date().toISOString();
    await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(internalId)}`,{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(update)
    });
    return res.status(200).json({ok:true,status});
  }catch(error){
    console.error('mercadopago-webhook',error);
    return res.status(200).json({ok:true});
  }
};