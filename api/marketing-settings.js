const {assertPlatformAdmin,getSettings,patchSettings,encrypt}=require('../lib/marketing');
const {serviceFetch}=require('../lib/mercadopago');

module.exports=async(req,res)=>{
  try{
    await assertPlatformAdmin(req);
    if(req.method==='GET'){
      const settings=await getSettings();
      const logs=await serviceFetch('/rest/v1/platform_marketing_logs?select=id,created_at,source,network,status,message,external_id,error&order=created_at.desc&limit=20');
      return res.status(200).json({settings:{...settings,access_token_enc:undefined,hasAccessToken:!!settings?.access_token_enc},logs:Array.isArray(logs)?logs:[]});
    }
    if(req.method==='PUT'||req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const data={
        enabled:!!body.enabled,
        facebook_enabled:!!body.facebook_enabled,
        instagram_enabled:!!body.instagram_enabled,
        facebook_page_id:String(body.facebook_page_id||'').trim()||null,
        instagram_account_id:String(body.instagram_account_id||'').trim()||null,
        promo_image_url:String(body.promo_image_url||'').trim()||null,
        site_url:String(body.site_url||'https://www.jpleiloes.com.br').trim()||'https://www.jpleiloes.com.br'
      };
      if(body.clearToken)data.access_token_enc=null;
      else if(String(body.accessToken||'').trim())data.access_token_enc=encrypt(String(body.accessToken).trim());
      const saved=await patchSettings(data);
      return res.status(200).json({ok:true,settings:{...saved,access_token_enc:undefined,hasAccessToken:!!saved?.access_token_enc}});
    }
    res.setHeader('Allow','GET, PUT, POST');return res.status(405).json({error:'Método não permitido.'});
  }catch(error){console.error('marketing-settings',error);return res.status(error.status||(/Sessão/i.test(error.message)?401:500)).json({error:error.message||'Não foi possível salvar a divulgação.'})}
};