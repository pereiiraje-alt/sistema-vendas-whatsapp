(()=>{
const originalFetch=window.fetch.bind(window);
window.fetch=async (input,init={})=>{
  const url=typeof input==='string'?input:(input?.url||'');
  if(!url.includes('/api/register-participant')) return originalFetch(input,init);
  let payload=null;
  try{payload=JSON.parse(init.body||'{}')}catch(_){}
  const response=await originalFetch(input,init);
  if(!payload?.email||!payload?.password||typeof db==='undefined') return response;

  if(response.ok){
    const login=await db.auth.signInWithPassword({email:payload.email,password:payload.password});
    if(login.error) console.error('Não foi possível iniciar a sessão do participante:',login.error.message);
    return response;
  }

  let problem={};
  try{problem=await response.clone().json()}catch(_){}
  const message=String(problem.error||problem.message||'');
  if(!/already|registered|exists|duplicate/i.test(message)) return response;

  const login=await db.auth.signInWithPassword({email:payload.email,password:payload.password});
  if(login.error) return response;
  const user=login.data?.user;
  if(!user) return response;
  const {data:p,error}=await db.from('participants').select('*').eq('auth_user_id',user.id).eq('company_id',payload.companyId).limit(1).maybeSingle();
  if(error||!p) return response;
  return new Response(JSON.stringify({participant:p,existing:true}),{status:200,headers:{'Content-Type':'application/json'}});
};
})();