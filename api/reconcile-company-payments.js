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

async function searchPayment(accessToken,externalReference){
  const url=`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`;
  const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||data.error||'Não foi possível consultar o pagamento no Mercado Pago.');
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
    if(!token)return res.status(401).json({error:'Sessão necessária.'});
    const user=await authUser(token);

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const companyId=String(body.companyId||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(companyId))return res.status(400).json({error:'Empresa inválida.'});

    const members=await serviceFetch(`/rest/v1/company_members?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(user.id)}&select=company_id&limit=1`);
    if(!Array.isArray(members)||!members[0])return res.status(403).json({error:'Você não tem acesso a esta empresa.'});

    const [connections,payments,arremates]=await Promise.all([
      serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(companyId)}&active=eq.true&select=access_token_encrypted&limit=1`),
      serviceFetch(`/rest/v1/payments?company_id=eq.${encodeURIComponent(companyId)}&status=in.(pending,processing)&select=id,status,provider_payment_id,updated_at,arremate_id&order=updated_at.desc&limit=100`),
      serviceFetch(`/rest/v1/arremates?company_id=eq.${encodeURIComponent(companyId)}&select=id,created_at`)
    ]);

    const connection=Array.isArray(connections)?connections[0]:null;
    const rows=Array.isArray(payments)?payments:[];
    const arremateMap=new Map((Array.isArray(arremates)?arremates:[]).map(a=>[String(a.id),a]));
    if(!rows.length)return res.status(200).json({ok:true,checked:0,updated:0,expired:0,connected:!!connection?.access_token_encrypted});

    const accessToken=connection?.access_token_encrypted?decrypt(connection.access_token_encrypted):null;
    let updated=0;
    let expired=0;

    for(const payment of rows){
      try{
        let currentStatus=payment.status;
        if(accessToken){
          const mp=await searchPayment(accessToken,payment.id);
          if(mp){
            const status=mapStatus(String(mp.status||''));
            const patch={status,provider_payment_id:String(mp.id||payment.provider_payment_id||''),updated_at:new Date().toISOString()};
            if(status==='paid')patch.paid_at=mp.date_approved||new Date().toISOString();
            await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}&company_id=eq.${encodeURIComponent(companyId)}`,{
              method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)
            });
            if(status!==payment.status)updated+=1;
            currentStatus=status;
          }
        }

        if(currentStatus!=='paid'){
          const arremate=arremateMap.get(String(payment.arremate_id));
          const deadline=arremate?.created_at?new Date(arremate.created_at).getTime()+PAYMENT_LIMIT_MS:0;
          if(deadline&&Date.now()>=deadline){
            await serviceFetch(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}&company_id=eq.${encodeURIComponent(companyId)}`,{
              method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'cancelled',updated_at:new Date().toISOString()})
            });
            updated+=currentStatus==='cancelled'?0:1;
            expired+=1;
          }
        }
      }catch(error){
        console.error('reconcile-company-payment',payment.id,error);
      }
    }

    return res.status(200).json({ok:true,checked:rows.length,updated,expired,connected:!!accessToken});
  }catch(error){
    console.error('reconcile-company-payments',error);
    return res.status(500).json({error:error.message||'Não foi possível sincronizar os pagamentos.'});
  }
};