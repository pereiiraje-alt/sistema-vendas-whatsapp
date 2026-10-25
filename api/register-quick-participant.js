const crypto=require('node:crypto');
const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
async function readJson(response){return response.json().catch(()=>({}));}
function hashAccessKey(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function normalizeName(value){return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
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
  if(!serviceKey)return res.status(500).json({error:'Serviço de cadastro indisponível.'});
  const {companyId,lotId,fullName,cpf,phone}=req.body||{};
  const name=String(fullName||'').trim().replace(/\s+/g,' ');
  const document=String(cpf||'').replace(/\D/g,'');
  const mobile=String(phone||'').replace(/\D/g,'');
  if(!/^[0-9a-f-]{36}$/i.test(String(companyId))||!/^[0-9a-f-]{36}$/i.test(String(lotId)))return res.status(400).json({error:'Leilão inválido.'});
  if(name.length<3||name.length>120||!validCpf(document)||mobile.length<10||mobile.length>13)return res.status(400).json({error:'Informe nome, CPF válido e telefone com DDD.'});
  const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
  try{
    const lotResponse=await fetch(SUPABASE_URL+'/rest/v1/lots?id=eq.'+encodeURIComponent(lotId)+'&company_id=eq.'+encodeURIComponent(companyId)+'&select=id,status,ends_at&limit=1',{headers});
    const lots=await readJson(lotResponse);
    if(!lotResponse.ok||!Array.isArray(lots)||lots[0]?.status!=='live'||!lots[0]?.ends_at||Date.now()>=Date.parse(lots[0].ends_at))return res.status(403).json({error:'Leilão encerrado ou indisponível.'});
    const existingResponse=await fetch(SUPABASE_URL+'/rest/v1/participants?company_id=eq.'+encodeURIComponent(companyId)+'&cpf=eq.'+document+'&select=id,company_id,auth_user_id,full_name,cpf,phone,email,status&limit=1',{headers});
    const existing=await readJson(existingResponse);
    if(!existingResponse.ok)return res.status(502).json({error:'Não foi possível conferir seu cadastro.'});
    const accessKey=crypto.randomBytes(32).toString('base64url');
    const accessHash=hashAccessKey(accessKey);
    const password=crypto.randomBytes(36).toString('base64url');
    if(existing.length){
      const p=existing[0];
      const sameName=normalizeName(p.full_name)===normalizeName(name);
      const samePhone=String(p.phone||'').replace(/\D/g,'')===mobile;
      if(!sameName||!samePhone)return res.status(409).json({error:'Este CPF já possui cadastro. Confira os dados informados ou use “Já participei”.'});

      // Nunca gere uma nova credencial somente com nome + CPF + telefone.
      // Esses dados podem ser conhecidos por terceiros e não comprovam posse do cadastro.
      if(p.quick_access_hash){
        return res.status(409).json({
          error:'Este CPF já possui acesso rápido. Use “Já participei” neste aparelho. Se trocou de aparelho ou perdeu o acesso, procure o organizador para liberar um novo acesso.'
        });
      }
      return res.status(409).json({
        error:'Este CPF já possui cadastro anterior. Procure o organizador para liberar o acesso rápido com segurança.'
      });
    }
    const email='participante-'+crypto.randomUUID()+'@jpleiloes.com.br';
    const create=await fetch(SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name:name,account_type:'quick_participant'}})});
    const user=await readJson(create);
    if(!create.ok||!user.id)return res.status(502).json({error:'Não foi possível iniciar o cadastro.'});
    const created=await fetch(SUPABASE_URL+'/rest/v1/participants',{method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({company_id:companyId,auth_user_id:user.id,full_name:name,cpf:document,phone:mobile,email,status:'approved',quick_access_hash:accessHash})});
    const rows=await readJson(created);
    if(!created.ok||!Array.isArray(rows)||!rows[0]){
      await fetch(SUPABASE_URL+'/auth/v1/admin/users/'+user.id,{method:'DELETE',headers}).catch(()=>{});
      return res.status(400).json({error:'Não foi possível salvar o participante. Verifique se o CPF já foi utilizado.'});
    }
    return res.status(201).json({participant:rows[0],credentials:{email,password},accessKey});
  }catch(e){console.error('quick participant error',e.message);return res.status(500).json({error:'Falha temporária no cadastro.'});}
};