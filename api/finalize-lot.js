const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';

async function sb(path,opts={}){
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
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const lotId=String(body.lotId||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(lotId)) return res.status(400).json({error:'Lote inválido.'});

    await sb('/rest/v1/rpc/finalize_lot',{method:'POST',body:JSON.stringify({p_lot_id:lotId})});
    const arremates=await sb(`/rest/v1/arremates?lot_id=eq.${encodeURIComponent(lotId)}&select=id,company_id,lot_id,participant_id,winning_bid,total_amount,created_at&limit=1`);
    const arremate=Array.isArray(arremates)?arremates[0]:null;
    if(!arremate) return res.status(200).json({sold:false,arremate:null,payment:null,paymentOnlineReady:false});

    const payments=await sb(`/rest/v1/payments?arremate_id=eq.${encodeURIComponent(arremate.id)}&select=id,method,status,amount,checkout_url,pix_qr_code,pix_qr_code_base64,paid_at&limit=1`);
    const payment=Array.isArray(payments)?payments[0]:null;
    const connections=await sb(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(arremate.company_id)}&active=eq.true&select=id&limit=1`);

    return res.status(200).json({sold:true,arremate,payment,paymentOnlineReady:Array.isArray(connections)&&connections.length>0});
  }catch(error){
    console.error('finalize-lot',error);
    return res.status(500).json({error:error.message||'Não foi possível finalizar o lote.'});
  }
};