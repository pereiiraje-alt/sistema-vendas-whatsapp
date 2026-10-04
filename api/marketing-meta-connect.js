const {assertPlatformAdmin}=require('../lib/marketing');
const {app,redirectUri,makeState}=require('../lib/meta-oauth');

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const user=await assertPlatformAdmin(req);
    const meta=await app();
    const state=makeState({userId:user.id,exp:Date.now()+10*60*1000});
    const params=new URLSearchParams({
      client_id:meta.id,
      redirect_uri:redirectUri(),
      state,
      response_type:'code',
      scope:'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish'
    });
    return res.status(200).json({url:`https://www.facebook.com/v24.0/dialog/oauth?${params.toString()}`});
  }catch(error){
    console.error('marketing-meta-connect',error);
    return res.status(error.status||500).json({error:error.message||'Não foi possível iniciar a conexão com a Meta.'});
  }
};