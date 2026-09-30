(()=>{
  function install(){
    const form=document.querySelector('#registerForm');
    if(!form||typeof loadPublicLot!=='function'||typeof openLot!=='function')return false;

    // Cabeçalho com as duas opções: entrar ou cadastrar.
    const head=form.querySelector('.modal-head');
    if(head&&!form.querySelector('#participantAuthTabs')){
      const tabs=document.createElement('div');
      tabs.id='participantAuthTabs';
      tabs.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 16px';
      tabs.innerHTML='<button id="participantLoginTab" type="button" class="ghost">Já tenho cadastro</button><button id="participantSignupTab" type="button" class="primary">Quero me cadastrar</button>';
      head.insertAdjacentElement('afterend',tabs);
    }

    const originalFields=[...form.children].filter(el=>{
      if(el.id==='participantAuthTabs'||el.classList?.contains('modal-head'))return false;
      return true;
    });
    originalFields.forEach(el=>{
      if(!el.dataset.participantSignupField)el.dataset.participantSignupField='1';
      if(!el.dataset.participantOriginalDisplay)el.dataset.participantOriginalDisplay=el.style.display||'';
    });

    let loginBox=form.querySelector('#participantLoginBox');
    if(!loginBox){
      loginBox=document.createElement('div');
      loginBox.id='participantLoginBox';
      loginBox.style.display='none';
      loginBox.innerHTML=`
        <p class="muted">Se você já se cadastrou para dar lances, entre com seu e-mail e senha.</p>
        <label>E-mail<input id="participantLoginEmail" type="email" autocomplete="email" placeholder="seu@email.com"></label>
        <label>Senha<input id="participantLoginPassword" type="password" autocomplete="current-password" minlength="6" placeholder="Sua senha"></label>
        <div id="participantLoginError" class="login-error" hidden></div>
        <button id="participantLoginButton" type="button" class="primary full">Entrar e dar lance</button>
        <button id="participantForgotButton" type="button" class="login-link" style="width:100%;margin-top:8px">Esqueci minha senha</button>`;
      form.appendChild(loginBox);
    }

    const loginTab=form.querySelector('#participantLoginTab');
    const signupTab=form.querySelector('#participantSignupTab');
    const loginEmail=form.querySelector('#participantLoginEmail');
    const loginPassword=form.querySelector('#participantLoginPassword');
    const loginButton=form.querySelector('#participantLoginButton');
    const loginError=form.querySelector('#participantLoginError');
    const forgotButton=form.querySelector('#participantForgotButton');

    function setMode(mode){
      const login=mode==='login';
      form.querySelectorAll('[data-participant-signup-field="1"]').forEach(el=>{
        el.hidden=login;
        el.style.display=login?'none':(el.dataset.participantOriginalDisplay||'');
      });
      loginBox.hidden=!login;
      loginBox.style.display=login?'block':'none';
      if(loginTab){loginTab.className=login?'primary':'ghost'}
      if(signupTab){signupTab.className=login?'ghost':'primary'}
      if(loginError)loginError.hidden=true;
      hideRecovery();
      if(login){setTimeout(()=>loginEmail?.focus(),0)}
      else{setTimeout(()=>document.querySelector('#rname')?.focus(),0)}
    }
    if(loginTab)loginTab.onclick=()=>setMode('login');
    if(signupTab)signupTab.onclick=()=>setMode('signup');

    let recoveryBox=document.querySelector('#participantRecoveryBox');
    if(!recoveryBox){
      recoveryBox=document.createElement('div');
      recoveryBox.id='participantRecoveryBox';
      recoveryBox.hidden=true;
      recoveryBox.style.cssText='display:none;margin:10px 0;padding:12px;border:1px solid #f0c36d;border-radius:10px;background:#fff8e8;color:#5f4a16;font-size:14px';
      recoveryBox.innerHTML='<div id="participantRecoveryMessage" style="margin-bottom:10px"></div><button id="participantRecoveryButton" type="button" class="ghost" style="width:100%">Redefinir minha senha</button>';
      loginBox.appendChild(recoveryBox);
    }

    const recoveryMessage=recoveryBox.querySelector('#participantRecoveryMessage');
    const recoveryButton=recoveryBox.querySelector('#participantRecoveryButton');
    let recoveryEmail='';

    function hideRecovery(){
      if(!recoveryBox)return;
      recoveryBox.hidden=true;
      recoveryBox.style.display='none';
      recoveryEmail='';
      if(recoveryMessage)recoveryMessage.textContent='';
      if(recoveryButton){recoveryButton.disabled=false;recoveryButton.textContent='Redefinir minha senha'}
    }

    function showRecovery(email,message){
      recoveryEmail=String(email||'').trim().toLowerCase();
      recoveryBox.hidden=false;
      recoveryBox.style.display='block';
      if(recoveryMessage)recoveryMessage.textContent=message||'Não foi possível entrar. Você pode redefinir sua senha.';
    }

    async function sendRecovery(email){
      email=String(email||'').trim().toLowerCase();
      if(!email)throw new Error('Informe seu e-mail primeiro.');
      const redirectTo=location.origin+'/login.html?recovery=1';
      const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
      if(error)throw error;
      return email;
    }

    recoveryButton.onclick=async()=>{
      const email=recoveryEmail||loginEmail?.value||remail?.value||'';
      recoveryButton.disabled=true;recoveryButton.textContent='Enviando...';
      try{
        const sent=await sendRecovery(email);
        if(recoveryMessage)recoveryMessage.textContent='Enviamos um link para redefinir a senha para '+sent+'. Verifique também a caixa de spam.';
        recoveryButton.textContent='E-mail enviado';
      }catch(error){
        if(recoveryMessage)recoveryMessage.textContent=error.message||'Não foi possível enviar o e-mail de redefinição.';
        recoveryButton.disabled=false;recoveryButton.textContent='Tentar novamente';
      }
    };

    forgotButton.onclick=async()=>{
      const email=String(loginEmail.value||'').trim().toLowerCase();
      try{
        const sent=await sendRecovery(email);
        showRecovery(sent,'Enviamos um link de redefinição para '+sent+'. Verifique seu e-mail e a caixa de spam.');
      }catch(error){
        showRecovery(email,error.message||'Não foi possível enviar a recuperação de senha.');
      }
    };

    async function participantForUser(l,user){
      let {data:p,error}=await db.from('participants').select('*').eq('company_id',l.companyId).eq('auth_user_id',user.id).limit(1).maybeSingle();
      if(error)throw error;
      if(p)return p;

      const {data:previous,error:previousError}=await db.from('participants').select('*').eq('auth_user_id',user.id).order('created_at',{ascending:true}).limit(1).maybeSingle();
      if(previousError)throw previousError;
      if(!previous)throw new Error('Esta conta existe, mas ainda não possui cadastro de participante. Use a opção “Quero me cadastrar”.');

      const {data:created,error:createError}=await db.from('participants').insert({
        company_id:l.companyId,auth_user_id:user.id,full_name:previous.full_name,cpf:previous.cpf,phone:previous.phone,email:previous.email||user.email,status:'approved'
      }).select().single();
      if(createError)throw createError;
      return created;
    }

    async function finishLogin(l,id,email,password){
      const {data,error}=await db.auth.signInWithPassword({email,password});
      if(error||!data?.user){
        showRecovery(email,'E-mail ou senha incorretos. Tente novamente ou redefina sua senha.');
        throw Object.assign(new Error('E-mail ou senha incorretos.'),{code:'LOGIN_FAILED'});
      }
      const p=await participantForUser(l,data.user);
      participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};
      registerModal.close();pendingBid=null;await openLot(id);
    }

    loginButton.onclick=async()=>{
      const id=pendingBid;if(!id)return;
      const email=String(loginEmail.value||'').trim().toLowerCase();
      const password=loginPassword.value;
      if(!email||!password){loginError.textContent='Informe e-mail e senha.';loginError.hidden=false;return}
      const old=loginButton.textContent;loginButton.disabled=true;loginButton.textContent='Entrando...';loginError.hidden=true;hideRecovery();
      try{const l=await loadPublicLot(id);await finishLogin(l,id,email,password)}
      catch(error){if(error?.code!=='LOGIN_FAILED'){loginError.textContent=error.message||'Não foi possível entrar.';loginError.hidden=false}}
      finally{loginButton.disabled=false;loginButton.textContent=old}
    };

    async function continueWithExistingUser(l,id,email,password){
      try{await finishLogin(l,id,email,password)}catch(error){if(error?.code==='LOGIN_FAILED')setMode('login');throw error}
    }

    form.onsubmit=async e=>{
      e.preventDefault();
      const id=pendingBid;if(!id)return;
      hideRecovery();
      const button=form.querySelector('button[type="submit"]');
      const oldText=button?.textContent;
      try{
        if(button){button.disabled=true;button.textContent='Cadastrando...'}
        const l=await loadPublicLot(id);
        const email=remail.value.trim().toLowerCase();
        const password=rpassword.value;
        const response=await fetch('/api/register-participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId:l.companyId,lotId:id,email,password,fullName:rname.value.trim(),cpf:rcpf.value.trim(),phone:rphone.value.trim()})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok){
          const message=String(result.error||'');
          if(/already.*registered|already.*exists|email.*registered|user.*registered/i.test(message)){
            loginEmail.value=email;loginPassword.value=password;setMode('login');
            await continueWithExistingUser(l,id,email,password);return;
          }
          throw new Error(message||'Não foi possível realizar o cadastro.');
        }
        const p=result.participant;
        if(!p?.id)throw new Error('Cadastro criado, mas o participante não foi retornado.');
        participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};
        registerModal.close();pendingBid=null;await openLot(id);
      }catch(err){
        if(err?.code==='LOGIN_FAILED')return;
        alert('Cadastro: '+(err?.message||'Não foi possível realizar o cadastro.'));
      }finally{if(button){button.disabled=false;button.textContent=oldText||'Cadastrar e participar'}}
    };

    setMode('signup');
    return true;
  }
  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>100)clearInterval(timer)},50);
})();