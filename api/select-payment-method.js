const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';

async function serviceFetch(path,opts={}){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(opts.headers||{})};
  const response=await fetch(`${SUPABASE_URL}${path}`,{...opts,headers});
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok) throw new Error(data?.message||data?.error||data?.hint||String(data||`Erro ${response.status}`));
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
    if(!token) return res.status(401).json({error:'Faça login como participante para escolher a forma de pagamento.'});

    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const userResponse=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`}});
    const user=await userResponse.json().catch(()=>null);
    if(!userResponse.ok||!user?.id) return res.status(401).json({error:'Sessão do participante inválida ou expirada.'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const lotId=String(body.lotId||'').trim();
    const method=String(body.method||'').toLowerCase();
    if(!/^[0-9a-f-]{36}$/i.test(lotId)) return res.status(400).json({error:'Lote inválido.'});
    if(!['pix','card','boleto'].includes(method)) return res.status(400).json({error:'Forma de pagamento inválida.'});

    await serviceFetch('/rest/v1/rpc/finalize_lot',{method:'POST',body:JSON.stringify({p_lot_id:lotId})});
    const arremates=await serviceFetch(`/rest/v1/arremates?lot_id=eq.${encodeURIComponent(lotId)}&select=id,company_id,participant_id,winning_bid,total_amount&limit=1`);
    const arremate=Array.isArray(arremates)?arremates[0]:null;
    if(!arremate) return res.status(409).json({error:'Este lote não possui arrematante.'});

    const participants=await serviceFetch(`/rest/v1/participants?auth_user_id=eq.${encodeURIComponent(user.id)}&company_id=eq.${encodeURIComponent(arremate.company_id)}&select=id&limit=1`);
    const p=Array.isArray(participants)?participants[0]:null;
    if(!p||p.id!==arremate.participant_id) return res.status(403).json({error:'Somente o arrematante pode escolher a forma de pagamento.'});

    const amount=Number(arremate.total_amount||arremate.winning_bid||0);
    const payload={company_id:arremate.company_id,arremate_id:arremate.id,provider:'mercado_pago',method,status:'pending',amount};
    const payment=await serviceFetch('/rest/v1/payments?on_conflict=arremate_id',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify(payload)
    });
    const saved=Array.isArray(payment)?payment[0]:payment;

    const connections=await serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(arremate.company_id)}&active=eq.true&select=id&limit=1`);
    const onlineReady=Array.isArray(connections)&&connections.length>0;
    return res.status(200).json({payment:saved,onlineReady,message:onlineReady?'Forma de pagamento selecionada.':'Forma de pagamento registrada. A empresa ainda precisa ativar o pagamento online.'});
  }catch(error){
    console.error('select-payment-method',error);
    return res.status(500).json({error:error.message||'Não foi possível salvar a forma de pagamento.'});
  }
};