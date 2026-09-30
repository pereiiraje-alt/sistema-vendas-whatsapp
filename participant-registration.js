(()=>{
  function install(){
    const form=document.querySelector('#registerForm');
    if(!form||typeof loadPublicLot!=='function'||typeof openLot!=='function')return false;

    let recoveryBox=document.querySelector('#participantRecoveryBox');
    if(!recoveryBox){
      recoveryBox=document.createElement('div');
      recoveryBox.id='participantRecoveryBox';
      recoveryBox.hidden=true;
      recoveryBox.style.cssText='margin:10px 0;padding:12px;border:1px solid #f0c36d;border-radius:10px;background:#fff8e8;color:#5f4a16;font-size:14px';
      recoveryBox.innerHTML='<div id="participantRecoveryMessage" style="margin-bottom:10px"></div><button id="participantRecoveryButton" type="button" class="ghost" style="width:100%">Redefinir minha senha</button>';
      const submit=form.querySelector('button[type="submit"]');
      if(submit)submit.insertAdjacentElement('beforebegin',recoveryBox);
      else form.appendChild(recoveryBox);
    }

    const recoveryMessage=recoveryBox.querySelector('#participantRecoveryMessage');
    const recoveryButton=recoveryBox.querySelector('#participantRecoveryButton');
    let recoveryEmail='';

    function hideRecovery(){
      recoveryBox.hidden=true;
      recoveryEmail='';
      if(recoveryMessage)recoveryMessage.textContent='';
      if(recoveryButton){recoveryButton.disabled=false;recoveryButton.textContent='Redefinir minha senha'}
    }

    function showRecovery(email){
      recoveryEmail=String(email||'').trim().toLowerCase();
      recoveryBox.hidden=false;
      if(recoveryMessage)recoveryMessage.textContent='Este e-mail já está cadastrado, mas a senha informada está incorreta. Você pode tentar novamente ou redefinir sua senha.';
    }

    recoveryButton.onclick=async()=>{
      const email=(recoveryEmail||remail?.value||'').trim().toLowerCase();
      if(!email)return;
      recoveryButton.disabled=true;
      recoveryButton.textContent='Enviando...';
      try{
        const redirectTo=location.origin+'/login.html?recovery=1';
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
        if(error)throw error;
        if(recoveryMessage)recoveryMessage.textContent='Enviamos um link para redefinir a senha para '+email+'. Verifique também a caixa de spam.';
        recoveryButton.textContent='E-mail enviado';
      }catch(error){
        if(recoveryMessage)recoveryMessage.textContent=error.message||'Não foi possível enviar o e-mail de redefinição.';
        recoveryButton.disabled=false;
        recoveryButton.textContent='Tentar redefinir novamente';
      }
    };

    async function continueWithExistingUser(l,id,email,password){
      const {data:loginData,error:loginError}=await db.auth.signInWithPassword({email,password});
      if(loginError||!loginData?.user){
        showRecovery(email);
        const error=new Error('Este e-mail já está cadastrado. Informe a senha correta para continuar.');
        error.code='EXISTING_USER_WRONG_PASSWORD';
        throw error;
      }

      hideRecovery();
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
      await openLot(id);
    }

    form.onsubmit=async e=>{
      e.preventDefault();
      const id=pendingBid;
      if(!id)return;
      hideRecovery();
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
          body:JSON.stringify({companyId:l.companyId,lotId:id,email,password,fullName:rname.value.trim(),cpf:rcpf.value.trim(),phone:rphone.value.trim()})
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
        registerModal.close();
        pendingBid=null;
        await openLot(id);
      }catch(err){
        if(err?.code==='EXISTING_USER_WRONG_PASSWORD')return;
        let message=err?.message||'Não foi possível realizar o cadastro.';
        if(/invalid login credentials/i.test(message)){
          showRecovery(remail?.value||'');
          return;
        }
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