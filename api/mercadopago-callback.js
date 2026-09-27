const {readState,exchangeCode,encrypt,serviceFetch}=require('./_mercadopago');

module.exports=async(req,res)=>{
  try{
    const code=String(req.query?.code||'');
    const state=String(req.query?.state||'');
    const errorParam=String(req.query?.error||'');
    if(errorParam)return res.redirect(302,'/?client=1&mp=error');
    if(!code||!state)throw new Error('Retorno do Mercado Pago incompleto.');

    const context=readState(state);
    const token=await exchangeCode(code);
    const expiresAt=token.expires_in?new Date(Date.now()+Number(token.expires_in)*1000).toISOString():null;
    const payload={
      company_id:context.companyId,
      mp_user_id:String(token.user_id||''),
      access_token_encrypted:encrypt(token.access_token),
      refresh_token_encrypted:encrypt(token.refresh_token||''),
      token_expires_at:expiresAt,
      connected_at:new Date().toISOString(),
      active:true,
      updated_at:new Date().toISOString()
    };
    await serviceFetch('/rest/v1/mercado_pago_connections?on_conflict=company_id',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(payload)
    });
    return res.redirect(302,'/?client=1&mp=connected');
  }catch(error){
    console.error('mercadopago-callback',error);
    return res.redirect(302,'/?client=1&mp=error');
  }
};