const {publishConfigured}=require('../lib/marketing');

module.exports=async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método não permitido.'})}
  try{
    const secret=process.env.CRON_SECRET;
    const auth=String(req.headers.authorization||'');
    if(!secret||auth!==`Bearer ${secret}`)return res.status(401).json({error:'Não autorizado.'});
    const result=await publishConfigured({source:'cron',ignoreDisabled:false});
    return res.status(200).json(result);
  }catch(error){console.error('marketing-cron',error);return res.status(500).json({error:error.message||'Falha na divulgação automática.'})}
};