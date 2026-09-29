const {authUser,serviceFetch,serviceKey,SUPABASE_URL}=require('../lib/mercadopago');

async function assertPlatformAdmin(token){
  const user=await authUser(token);
  const rows=await serviceFetch(`/rest/v1/company_members?user_id=eq.${encodeURIComponent(user.id)}&role=eq.platform_admin&select=user_id&limit=1`);
  if(!Array.isArray(rows)||!rows[0])throw new Error('Acesso restrito ao administrador da plataforma.');
  return user;
}

async function deleteUserAccount(adminUser,targetUserId){
  if(!targetUserId)throw new Error('Usuário não informado.');
  if(targetUserId===adminUser.id)throw new Error('Você não pode excluir o próprio usuário administrador.');

  const targetMembership=await serviceFetch(`/rest/v1/company_members?user_id=eq.${encodeURIComponent(targetUserId)}&select=role&limit=10`);
  if(Array.isArray(targetMembership)&&targetMembership.some(x=>x.role==='platform_admin')){
    throw new Error('Usuários administradores da plataforma não podem ser excluídos por esta tela.');
  }

  const key=serviceKey();
  const response=await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`,{
    method:'DELETE',
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}
  });
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok)throw new Error(data?.message||data?.error||String(data||'Não foi possível excluir o usuário.'));
  return data;
}

module.exports=async(req,res)=>{
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Sessão necessária.'});
    const adminUser=await assertPlatformAdmin(token);

    if(req.method==='DELETE'){
      const targetUserId=String(req.body?.userId||req.query?.userId||'').trim();
      await deleteUserAccount(adminUser,targetUserId);
      return res.status(200).json({ok:true});
    }

    if(req.method!=='GET'){
      res.setHeader('Allow','GET, DELETE');
      return res.status(405).json({error:'Método não permitido.'});
    }

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
    const status=/Acesso restrito|Sessão inválida|Sessão necessária/i.test(error.message||'')?403:400;
    return res.status(status).json({error:error.message||'Não foi possível concluir a operação.'});
  }
};