const {authUser,serviceFetch,membershipForUser}=require('../lib/mercadopago');

module.exports=async(req,res)=>{
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token)return res.status(401).json({error:'Faça login para consultar o Mercado Pago.'});
    const user=await authUser(token);
    const member=await membershipForUser(user.id,token);
    if(!member?.company_id)return res.status(403).json({error:'Sua conta ainda não está vinculada a uma empresa. Saia e entre novamente; se continuar, peça ao administrador para verificar o vínculo.'});
    const rows=await serviceFetch(`/rest/v1/mercado_pago_connections?company_id=eq.${encodeURIComponent(member.company_id)}&select=mp_user_id,connected_at,active,token_expires_at&limit=1`);
    const c=Array.isArray(rows)?rows[0]:null;
    return res.status(200).json({connected:!!c?.active,connection:c||null,canConnect:['owner','manager','platform_admin'].includes(String(member.role))});
  }catch(error){
    console.error('mercadopago-status',error);
    return res.status(500).json({error:error.message||'Não foi possível consultar o Mercado Pago.'});
  }
};