const crypto=require('node:crypto');
const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';

async function readJson(response){return response.json().catch(()=>({}));}
function hashAccessKey(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function normalizeName(value){
  return String(value||'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}
function validCpf(raw){
  const digits=String(raw||'').replace(/\D/g,'');
  if(digits.length!==11||/^(\d)\1{10}$/.test(digits))return false;
  for(let length=9;length<=10;length++){
    let sum=0;for(let i=0;i<length;i++)sum+=Number(digits[i])*(length+1-i);
    const check=(sum*10)%11%10;
    if(check!==Number(digits[length]))return false;
  }
  return true;
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey)return res.status(500).json({error:'Serviço de acesso indisponível.'});

  const {companyId,lotId,fullName,cpf,accessKey}=req.body||{};
  const name=String(fullName||'').trim().replace(/\s+/g,' ');
  const document=String(cpf||'').replace(/\D/g,'');
  const secret=String(accessKey||'').trim();

  if(!/^[0-9a-f-]{36}$/i.test(String(companyId))||!/^[0-9a-f-]{36}$/i.test(String(lotId))){
    return res.status(400).json({error:'Leilão inválido.'});
  }
  if(name.length<3||name.length>120||!validCpf(document)){
    return res.status(400).json({error:'Informe seu nome e CPF válido.'});
  }
  if(secret.length<20){
    return res.status(401).json({error:'Este aparelho ainda não possui seu acesso salvo. Use “Primeiro acesso” e confirme seu telefone uma vez.'});
  }

  const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
  try{
    const lotResponse=await fetch(SUPABASE_URL+'/rest/v1/lots?id=eq.'+encodeURIComponent(lotId)+'&company_id=eq.'+encodeURIComponent(companyId)+'&select=id&limit=1',{headers});
    const lots=await readJson(lotResponse);
    if(!lotResponse.ok||!Array.isArray(lots)||!lots[0])return res.status(404).json({error:'Leilão não encontrado.'});

    const pResponse=await fetch(
      SUPABASE_URL+'/rest/v1/participants?company_id=eq.'+encodeURIComponent(companyId)+'&cpf=eq.'+document+
      '&select=id,company_id,auth_user_id,full_name,cpf,phone,email,status,quick_access_hash&limit=1',
      {headers}
    );
    const rows=await readJson(pResponse);
    if(!pResponse.ok)return res.status(502).json({error:'Não foi possível conferir seu cadastro.'});
    const p=Array.isArray(rows)?rows[0]:null;
    if(!p)return res.status(404).json({error:'Cadastro não encontrado. Use “Primeiro acesso”.'});
    if(normalizeName(p.full_name)!==normalizeName(name))return res.status(401).json({error:'Nome ou CPF não conferem.'});
    if(!p.quick_access_hash)return res.status(401).json({error:'Seu cadastro precisa ser atualizado neste aparelho. Use “Primeiro acesso” e informe o telefone uma vez.'});

    const suppliedHash=hashAccessKey(secret);
    const a=Buffer.from(String(p.quick_access_hash));
    const b=Buffer.from(suppliedHash);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Este aparelho não está autorizado para este cadastro. Use “Primeiro acesso”.'});

    if(!p.auth_user_id||!p.email)return res.status(409).json({error:'Cadastro sem acesso ativo. Procure o organizador.'});
    const password=crypto.randomBytes(36).toString('base64url');
    const authUpdate=await fetch(SUPABASE_URL+'/auth/v1/admin/users/'+encodeURIComponent(p.auth_user_id),{
      method:'PUT',headers,body:JSON.stringify({password})
    });
    if(!authUpdate.ok)return res.status(502).json({error:'Não foi possível restaurar sua sessão.'});

    const participant={id:p.id,company_id:p.company_id,auth_user_id:p.auth_user_id,full_name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,status:p.status};
    return res.status(200).json({participant,credentials:{email:p.email,password}});
  }catch(error){
    console.error('quick participant login error',error.message);
    return res.status(500).json({error:'Falha temporária ao entrar.'});
  }
};