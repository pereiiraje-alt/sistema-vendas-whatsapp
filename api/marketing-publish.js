const {assertPlatformAdmin,publishConfigured}=require('../lib/marketing');

module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'})}
  try{await assertPlatformAdmin(req);const result=await publishConfigured({source:'manual',ignoreDisabled:true});return res.status(200).json(result)}
  catch(error){console.error('marketing-publish',error);return res.status(error.status||(/Sessão/i.test(error.message)?401:500)).json({error:error.message||'Não foi possível publicar.'})}
};