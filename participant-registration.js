(()=>{
  function install(){
    const form=document.querySelector('#registerForm');
    if(!form||typeof loadPublicLot!=='function'||typeof bid!=='function')return false;
    form.onsubmit=async e=>{
      e.preventDefault();
      const id=pendingBid;
      if(!id)return;
      const button=form.querySelector('button[type="submit"]');
      const oldText=button?.textContent;
      try{
        if(button){button.disabled=true;button.textContent='Cadastrando...'}
        const l=await loadPublicLot(id);
        const email=remail.value.trim().toLowerCase();
        const password=rpassword.value;
        const response=await fetch('/api/register-participant',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({companyId:l.companyId,email,password,fullName:rname.value.trim(),cpf:rcpf.value.trim(),phone:rphone.value.trim()})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(result.error||'Não foi possível realizar o cadastro.');
        const p=result.participant;
        if(!p?.id)throw new Error('Cadastro criado, mas o participante não foi retornado.');
        participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};
        registerModal.close();pendingBid=null;
        await bid(id);
      }catch(err){alert('Cadastro: '+err.message)}finally{
        if(button){button.disabled=false;button.textContent=oldText||'Cadastrar e participar'}
      }
    };
    return true;
  }
  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>100)clearInterval(timer)},50);
})();