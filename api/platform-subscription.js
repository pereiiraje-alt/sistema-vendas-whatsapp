const {authUser,serviceFetch,membershipForUser}=require('../lib/mercadopago');

const PUBLIC_ORIGIN='https://sistema-vendas-whatsapp.vercel.app';

function platformToken(){
  const token=process.env.MP_PLATFORM_ACCESS_TOKEN;
  if(!token) throw new Error('MP_PLATFORM_ACCESS_TOKEN não configurado no servidor.');
  return token;
}

async function mpRequest(path,opts={}){
  const response=await fetch(`https://api.mercadopago.com${path}`,{
    ...opts,
    headers:{Authorization:`Bearer ${platformToken()}`,'Content-Type':'application/json',...(opts.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||data.error||data.error_description||`Mercado Pago retornou erro ${response.status}.`);
  return data;
}

async function contextFor(token){
  const user=await authUser(token);
  const membership=await membershipForUser(user.id,token);
  if(!membership?.company_id) throw new Error('Sua conta ainda não está vinculada a uma empresa.');
  const companies=await serviceFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(membership.company_id)}&select=id,name,email,plan,subscription_status,active,platform_fee_type,platform_fee_value&limit=1`);
  const company=Array.isArray(companies)?companies[0]:null;
  if(!company) throw new Error('Empresa não encontrada.');
  return {user,membership,company};
}

async function planFor(company){
  const rows=await serviceFetch(`/rest/v1/platform_plans?code=eq.${encodeURIComponent(company.plan)}&select=code,name,price,billing_period,charge_type,percentage,active,admin_only&limit=1`);
  return Array.isArray(rows)?rows[0]:null;
}

async function subscriptionFor(companyId){
  const rows=await serviceFetch(`/rest/v1/platform_subscriptions?company_id=eq.${encodeURIComponent(companyId)}&select=*&limit=1`);
  return Array.isArray(rows)?rows[0]:null;
}

function isPaidMonthly(plan){
  return !!plan&&plan.active===true&&plan.charge_type==='fixed'&&plan.billing_period==='monthly'&&Number(plan.price||0)>0;
}

async function saveCompanyBilling(companyId,status,active){
  await serviceFetch(`/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}`,{
    method:'PATCH',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({subscription_status:status,active,updated_at:new Date().toISOString()})
  });
}

async function syncSubscription(company,subscription){
  if(!subscription?.provider_subscription_id){
    return {allowed:false,status:'missing',needsSubscription:true,checkoutUrl:subscription?.checkout_url||null};
  }
  const remote=await mpRequest(`/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`);
  const mpStatus=String(remote.status||subscription.status||'pending').toLowerCase();
  const authorized=mpStatus==='authorized';
  const pending=mpStatus==='pending';
  const suspended=['paused','cancelled','canceled'].includes(mpStatus);
  const companyStatus=authorized?'active':pending?'pending_payment':suspended?'suspended':'pending_payment';
  await serviceFetch(`/rest/v1/platform_subscriptions?company_id=eq.${encodeURIComponent(company.id)}`,{
    method:'PATCH',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({status:mpStatus,checkout_url:remote.init_point||subscription.checkout_url||null,next_payment_at:remote.next_payment_date||null,updated_at:new Date().toISOString()})
  });
  await saveCompanyBilling(company.id,companyStatus,authorized);
  return {
    allowed:authorized,
    status:mpStatus,
    needsSubscription:suspended,
    checkoutUrl:remote.init_point||subscription.checkout_url||null,
    nextPaymentAt:remote.next_payment_date||null
  };
}

async function createOrReuse(company,user,plan){
  let subscription=await subscriptionFor(company.id);
  if(subscription?.provider_subscription_id){
    const synced=await syncSubscription(company,subscription);
    if(synced.allowed||(!synced.needsSubscription&&synced.checkoutUrl)) return synced;
  }

  const amount=Number(plan.price||0);
  const payload={
    reason:`LanceCerto - ${plan.name||'Plano mensal'}`,
    external_reference:String(company.id),
    payer_email:String(company.email||user.email||'').trim().toLowerCase(),
    auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:amount,currency_id:'BRL'},
    back_url:`${PUBLIC_ORIGIN}/login.html?subscription=return`,
    status:'pending'
  };
  if(!payload.payer_email) throw new Error('A empresa precisa ter um e-mail válido para iniciar a assinatura.');

  const remote=await mpRequest('/preapproval',{method:'POST',body:JSON.stringify(payload)});
  if(!remote?.id||!remote?.init_point) throw new Error('O Mercado Pago não retornou o link da assinatura.');

  const row={
    company_id:company.id,provider:'mercado_pago',provider_subscription_id:String(remote.id),status:String(remote.status||'pending'),
    amount,currency_id:'BRL',checkout_url:remote.init_point,next_payment_at:remote.next_payment_date||null,updated_at:new Date().toISOString()
  };
  await serviceFetch('/rest/v1/platform_subscriptions?on_conflict=company_id',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)
  });
  await saveCompanyBilling(company.id,'pending_payment',false);
  return {allowed:false,status:String(remote.status||'pending'),needsSubscription:false,checkoutUrl:remote.init_point,nextPaymentAt:remote.next_payment_date||null};
}

module.exports=async(req,res)=>{
  if(!['GET','POST'].includes(req.method)){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token) return res.status(401).json({error:'Sessão necessária.'});
    const {user,company}=await contextFor(token);
    const plan=await planFor(company);

    if(!isPaidMonthly(plan)){
      return res.status(200).json({allowed:true,status:company.subscription_status||'active',plan:company.plan,requiresSubscription:false});
    }

    if(req.method==='POST'){
      const result=await createOrReuse(company,user,plan);
      return res.status(200).json({...result,plan:company.plan,requiresSubscription:true,amount:Number(plan.price||0)});
    }

    const subscription=await subscriptionFor(company.id);
    if(!subscription){
      await saveCompanyBilling(company.id,'pending_payment',false);
      return res.status(200).json({allowed:false,status:'missing',needsSubscription:true,checkoutUrl:null,plan:company.plan,requiresSubscription:true,amount:Number(plan.price||0)});
    }
    const result=await syncSubscription(company,subscription);
    return res.status(200).json({...result,plan:company.plan,requiresSubscription:true,amount:Number(plan.price||0)});
  }catch(error){
    console.error('platform-subscription',error);
    return res.status(500).json({error:error.message||'Não foi possível verificar a assinatura.'});
  }
};