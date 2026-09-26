(()=>{
const originalFetch=window.fetch.bind(window);
window.fetch=async (input,init={})=>{
  const url=typeof input==='string'?input:(input?.url||'');
  if(!url.includes('/api/register-participant')) return originalFetch(input,init);
  let credentials=null;
  try{credentials=JSON.parse(init.body||'{}')}catch(_){}
  const response=await originalFetch(input,init);
  if(response.ok&&credentials?.email&&credentials?.password&&typeof db!=='undefined'){
    const {error}=await db.auth.signInWithPassword({email:credentials.email,password:credentials.password});
    if(error) console.error('Não foi possível iniciar a sessão do participante:',error.message);
  }
  return response;
};
})();