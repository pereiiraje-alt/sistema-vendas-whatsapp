(()=>{
  if(typeof pages==='undefined'||typeof db==='undefined')return;

  async function configWithLocation(){
    if(!currentCompany){
      app.innerHTML='<div class="panel"><h3>Configurações</h3><p>Nenhuma empresa vinculada ao usuário atual.</p></div>';
      return;
    }

    let company=currentCompany;
    try{
      const {data,error}=await timeout(db.from('companies').select('*').eq('id',currentCompany.id).single(),7000,'carregar dados da empresa');
      if(error)throw error;
      company=data||currentCompany;
      currentCompany=company;
    }catch(e){
      console.warn('Não foi possível atualizar os dados da empresa:',e?.message||e);
    }

    app.innerHTML=`
      <div class="panel">
        <h3>Dados da empresa</h3>
        <p class="muted">Essas informações identificam sua empresa e também aparecem nos leilões públicos.</p>
        <form id="companyProfileForm" style="max-width:760px">
          <label>Nome da empresa<input id="companyProfileName" required value="${esc(company.name||'')}"></label>
          <div class="grid2">
            <label>Responsável<input id="companyProfileResponsible" value="${esc(company.responsible_name||'')}"></label>
            <label>Telefone / WhatsApp<input id="companyProfilePhone" type="tel" value="${esc(company.phone||'')}"></label>
          </div>
          <div class="grid2">
            <label>Cidade<input id="companyProfileCity" placeholder="Ex.: Curitiba" value="${esc(company.city||'')}"></label>
            <label>Estado (UF)<input id="companyProfileState" placeholder="PR" maxlength="2" value="${esc(company.state||'')}"></label>
          </div>
          <p class="muted">Exemplo no leilão público: <b>MERCADORIA REVERSA • CURITIBA/PR</b></p>
          <div id="companyProfileMessage" class="login-message" hidden></div>
          <div id="companyProfileError" class="login-error" hidden></div>
          <button id="saveCompanyProfile" class="primary" type="submit">Salvar dados</button>
        </form>
      </div>
      <div class="panel">
        <h3>Configurações</h3>
        <p>Empresa conectada: <b>${esc(company.name||'')}</b></p>
        <p class="muted">A cidade e o estado salvos acima serão exibidos automaticamente nos leilões públicos.</p>
      </div>`;

    const form=document.getElementById('companyProfileForm');
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=document.getElementById('saveCompanyProfile');
      const msg=document.getElementById('companyProfileMessage');
      const err=document.getElementById('companyProfileError');
      msg.hidden=true;err.hidden=true;
      const payload={
        name:document.getElementById('companyProfileName').value.trim(),
        responsible_name:document.getElementById('companyProfileResponsible').value.trim()||null,
        phone:document.getElementById('companyProfilePhone').value.trim()||null,
        city:document.getElementById('companyProfileCity').value.trim()||null,
        state:document.getElementById('companyProfileState').value.trim().toUpperCase()||null,
        updated_at:new Date().toISOString()
      };
      if(!payload.name){err.textContent='Informe o nome da empresa.';err.hidden=false;return;}
      if(payload.state&&payload.state.length!==2){err.textContent='Informe a UF com 2 letras, por exemplo PR.';err.hidden=false;return;}
      btn.disabled=true;btn.textContent='Salvando...';
      try{
        const {data,error}=await timeout(db.from('companies').update(payload).eq('id',currentCompany.id).select().single(),7000,'salvar dados da empresa');
        if(error)throw error;
        currentCompany=data;
        document.getElementById('companyName').textContent=data.name;
        msg.textContent='Dados salvos. Cidade e estado já ficarão disponíveis nos leilões públicos.';
        msg.hidden=false;
      }catch(error){
        err.textContent='Não foi possível salvar: '+(error?.message||error);
        err.hidden=false;
      }finally{
        btn.disabled=false;btn.textContent='Salvar dados';
      }
    };
  }

  config=configWithLocation;
  if(pages.config)pages.config[0]=configWithLocation;
})();