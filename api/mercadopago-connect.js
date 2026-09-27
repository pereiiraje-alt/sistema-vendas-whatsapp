const {env,authUser,serviceFetch,makeState,REDIRECT_URI}=require('./_mercadopago');

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Faça login para conectar o Mercado Pago.'});
    const user=await authUser(token);
    const memberships=await serviceFetch(`/rest/v1/company_members?user_id=eq.${encodeURIComponent(user.id)}&select=company_id,role&limit=1`);
    const member=Array.isArray(memberships)?memberships[0]:null;
    if(!member?.company_id)return res.status(403).json({error:'Usuário sem empresa vinculada.'});
    if(!['owner','manager','platform_admin'].includes(String(member.role)))return res.status(403).json({error:'Somente o proprietário ou gerente pode conectar o Mercado Pago.'});

    const {clientId}=env();
    const state=makeState({companyId:member.company_id,userId:user.id,exp:Date.now()+10*60*1000});
    const url=new URL('https://auth.mercadopago.com/authorization');
    url.searchParams.set('client_id',clientId);
    url.searchParams.set('response_type','code');
    url.searchParams.set('platform_id','mp');
    url.searchParams.set('state',state);
    url.searchParams.set('redirect_uri',REDIRECT_URI);
    return res.status(200).json({url:url.toString(),redirectUri:REDIRECT_URI});
  }catch(error){
    console.error('mercadopago-connect',error);
    return res.status(500).json({error:error.message||'Não foi possível iniciar a conexão com o Mercado Pago.'});
  }
};