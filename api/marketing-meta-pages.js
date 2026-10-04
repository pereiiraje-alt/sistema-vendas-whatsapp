const {assertPlatformAdmin}=require('../lib/marketing');
const {publicPages,selectPage}=require('../lib/meta-oauth');

module.exports=async(req,res)=>{
  try{
    await assertPlatformAdmin(req);
    if(req.method==='GET'){
      return res.status(200).json({pages:await publicPages()});
    }
    if(req.method==='POST'||req.method==='PUT'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const pageId=String(body.pageId||'').trim();
      if(!pageId)return res.status(400).json({error:'Selecione uma Página do Facebook.'});
      const saved=await selectPage(pageId);
      return res.status(200).json({ok:true,page:{id:saved.facebook_page_id,name:saved.facebook_page_name,instagramId:saved.instagram_account_id,instagramUsername:saved.instagram_username}});
    }
    res.setHeader('Allow','GET, POST, PUT');
    return res.status(405).json({error:'Método não permitido.'});
  }catch(error){
    console.error('marketing-meta-pages',error);
    return res.status(error.status||500).json({error:error.message||'Não foi possível carregar as páginas da Meta.'});
  }
};