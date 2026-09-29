const {authUser,serviceFetch}=require('../lib/mercadopago');

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão necessária para finalizar o lote.'});
    const user=await authUser(token);

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const lotId=String(body.lotId||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(lotId))return res.status(400).json({error:'Lote inválido.'});

    const lots=await serviceFetch(`/rest/v1/lots?id=eq.${encodeURIComponent(lotId)}&select=id,company_id&limit=1`);
    const lot=Array.isArray(lots)?lots[0]:null;
    if(!lot)return res.status(404).json({error:'Lote não encontrado.'});

    const [members,participants]=await Promise.all([
      serviceFetch(`/rest/v1/company_members?company_id=eq.${encodeURIComponent(lot.company_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`),
      serviceFetch(`/rest/v1/participants?company_id=eq.${encodeURIComponent(lot.company_id)}&auth_user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`)
    ]);
    const member=Array.isArray(members)&&!!members[0];
    const participant=Array.isArray(participants)?participants[0]:null;
    if(!member&&!participant)return res.status(403).json({error:'Você não tem acesso para finalizar este lote.'});

    await serviceFetch('/rest/v1/rpc/finalize_lot',{method:'POST',body:JSON.stringify({p_lot_id:lotId})});
    const arremates=await serviceFetch(`/rest/v1/arremates?lot_id=eq.${encodeURIComponent(lotId)}&select=id,company_id,lot_id,participant_id,winning_bid,total_amount,created_at&limit=1`);
    const arremate=Array.isArray(arremates)?arremates[0]:null;
    if(!arremate)return res.status(200).json({sold:false,isWinner:false,arremate:null,payment:null,paymentOnlineReady:false});

    const isWinner=!!participant&&participant.id===arremate.participant_id;
    const publicArremate={id:arremate.id,company_id:arremate.company_id,lot_id:arremate.lot_id,winning_bid:arremate.winning_bid,total_amount:arremate.total_amount,created_at:arremate.created_at};

    if(!isWinner){
      return res.status(200).json({sold:true,isWinner:false,arremate:publicArremate,payment:null,paymentOnlineReady:false});
    }

    const payments=await serviceFetch(`/rest/v1/payments?arremate_id=eq.${encodeURIComponent(arremate.id)}&select=id,method,status,amount,checkout_url,pix_qr_code,pix_qr_code_base64,paid_at&limit=1`);
    const payment=Array.isArray(payments)?payments[0]:null;
    const connections=await serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(arremate.company_id)}&active=eq.true&select=id&limit=1`);

    return res.status(200).json({sold:true,isWinner:true,arremate:publicArremate,payment,paymentOnlineReady:Array.isArray(connections)&&connections.length>0});
  }catch(error){
    console.error('finalize-lot',error);
    const msg=error.message||'Não foi possível finalizar o lote.';
    const status=/Sessão inválida|expirada/i.test(msg)?401:500;
    return res.status(status).json({error:msg});
  }
};