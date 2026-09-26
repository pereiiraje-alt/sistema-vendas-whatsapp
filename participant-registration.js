(()=>{
  function install(){
    const form=document.querySelector('#registerForm');
    if(!form||typeof loadPublicLot!=='function'||typeof bid!=='function')return false;

    async function continueWithExistingUser(l,id,email,password){
      const {data:loginData,error:loginError}=await db.auth.signInWithPassword({email,password});
      if(loginError||!loginData?.user){
        throw new Error('Este e-mail já está cadastrado. Informe a senha correta para continuar.');
      }

      const user=loginData.user;
      let {data:p,error:findError}=await db.from('participants')
        .select('*')
        .eq('company_id',l.companyId)
        .eq('auth_user_id',user.id)
        .limit(1)
        .maybeSingle();
      if(findError)throw findError;

      if(!p){
        const {data:newParticipant,error:insertError}=await db.from('participants').insert({
          company_id:l.companyId,
          auth_user_id:user.id,
          full_name:rname.value.trim(),
          cpf:rcpf.value.trim(),
          phone:rphone.value.trim(),
          email,
          status:'approved'
        }).select().single();
        if(insertError)throw insertError;
        p=newParticipant;
      }

      participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};
      registerModal.close();
      pendingBid=null;
      await bid(id);
    }

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

        if(!response.ok){
          const message=String(result.error||'');
          if(/already.*registered|already.*exists|email.*registered|user.*registered/i.test(message)){
            await continueWithExistingUser(l,id,email,password);
            return;
          }
          throw new Error(message||'Não foi possível realizar o cadastro.');
        }

        const p=result.participant;
        if(!p?.id)throw new Error('Cadastro criado, mas o participante não foi retornado.');
        participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};
        registerModal.close();pendingBid=null;
        await bid(id);
      }catch(err){
        let message=err?.message||'Não foi possível realizar o cadastro.';
        if(/invalid login credentials/i.test(message))message='Este e-mail já está cadastrado. Informe a senha correta para continuar.';
        alert('Cadastro: '+message);
      }finally{
        if(button){button.disabled=false;button.textContent=oldText||'Cadastrar e participar'}
      }
    };
    return true;
  }
  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>100)clearInterval(timer)},50);
})();