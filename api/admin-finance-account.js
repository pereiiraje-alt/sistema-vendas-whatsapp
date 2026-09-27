const {authUser,serviceFetch}=require('./_mercadopago');

async function assertPlatformAdmin(token){
  const user=await authUser(token);
  const rows=await serviceFetch(`/rest/v1/company_members?user_id=eq.${encodeURIComponent(user.id)}&role=eq.platform_admin&select=user_id&limit=1`);
  if(!Array.isArray(rows)||!rows[0])throw new Error('Acesso restrito ao administrador da plataforma.');
  return user;
}

module.exports=async(req,res)=>{
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão necessária.'});
    await assertPlatformAdmin(token);

    const platformToken=process.env.MP_PLATFORM_ACCESS_TOKEN;
    const marketplaceReady=!!(process.env.MP_CLIENT_ID&&process.env.MP_CLIENT_SECRET);
    if(!platformToken){
      return res.status(200).json({configured:false,marketplaceReady,account:null});
    }

    const response=await fetch('https://api.mercadopago.com/users/me',{
      headers:{Authorization:`Bearer ${platformToken}`,Accept:'application/json'}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      return res.status(200).json({configured:true,marketplaceReady,account:null,warning:data.message||data.error||'Não foi possível identificar a conta Mercado Pago.'});
    }

    return res.status(200).json({
      configured:true,
      marketplaceReady,
      account:{
        id:data.id||null,
        nickname:data.nickname||null,
        email:data.email||null,
        firstName:data.first_name||null,
        lastName:data.last_name||null,
        countryId:data.country_id||null
      }
    });
  }catch(error){
    console.error('admin-finance-account',error);
    return res.status(500).json({error:error.message||'Não foi possível consultar a conta de recebimento.'});
  }
};