const {assertPlatformAdmin,getSettings,patchSettings,encrypt}=require('../lib/marketing');
const {seal}=require('../lib/meta-oauth');
const {serviceFetch}=require('../lib/mercadopago');

function safeSettings(settings){
  return {
    ...settings,
    access_token_enc:undefined,
    meta_app_secret_enc:undefined,
    meta_accounts_enc:undefined,
    hasAccessToken:!!settings?.access_token_enc,
    hasMetaAppSecret:!!settings?.meta_app_secret_enc,
    hasMetaAccounts:!!settings?.meta_accounts_enc
  };
}

module.exports=async(req,res)=>{
  try{
    await assertPlatformAdmin(req);
    if(req.method==='GET'){
      const settings=await getSettings();
      const logs=await serviceFetch('/rest/v1/platform_marketing_logs?select=id,created_at,source,network,status,message,external_id,error&order=created_at.desc&limit=20');
      return res.status(200).json({settings:safeSettings(settings),logs:Array.isArray(logs)?logs:[]});
    }
    if(req.method==='PUT'||req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const data={
        enabled:!!body.enabled,
        facebook_enabled:!!body.facebook_enabled,
        instagram_enabled:!!body.instagram_enabled,
        promo_image_url:String(body.promo_image_url||'').trim()||null,
        site_url:String(body.site_url||'https://www.jpleiloes.com.br').trim()||'https://www.jpleiloes.com.br'
      };
      if(body.meta_app_id!==undefined)data.meta_app_id=String(body.meta_app_id||'').trim()||null;
      if(String(body.meta_app_secret||'').trim())data.meta_app_secret_enc=seal(String(body.meta_app_secret).trim());
      if(body.clearMetaApp){data.meta_app_id=null;data.meta_app_secret_enc=null;data.meta_accounts_enc=null;data.access_token_enc=null;data.facebook_page_id=null;data.facebook_page_name=null;data.instagram_account_id=null;data.instagram_username=null;data.meta_connected_at=null;data.enabled=false}
      if(body.clearToken){data.access_token_enc=null;data.facebook_page_id=null;data.facebook_page_name=null;data.instagram_account_id=null;data.instagram_username=null;data.meta_accounts_enc=null;data.meta_connected_at=null;data.enabled=false}
      else if(String(body.accessToken||'').trim())data.access_token_enc=encrypt(String(body.accessToken).trim());
      const saved=await patchSettings(data);
      return res.status(200).json({ok:true,settings:safeSettings(saved)});
    }
    res.setHeader('Allow','GET, PUT, POST');return res.status(405).json({error:'Método não permitido.'});
  }catch(error){console.error('marketing-settings',error);return res.status(error.status||(/Sessão/i.test(error.message)?401:500)).json({error:error.message||'Não foi possível salvar a divulgação.'})}
};