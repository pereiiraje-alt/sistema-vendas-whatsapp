const {readState,exchangeCode,longLived,pages,storePages,selectPage}=require('../lib/meta-oauth');

module.exports=async(req,res)=>{
  try{
    const code=String(req.query?.code||'').trim();
    const state=String(req.query?.state||'').trim();
    const denied=String(req.query?.error||'').trim();
    if(denied)return res.redirect('/admin.html?marketing=error&reason=denied');
    if(!code||!state)throw new Error('Retorno da Meta incompleto.');
    readState(state);
    const shortToken=await exchangeCode(code);
    const userToken=await longLived(shortToken);
    const list=await pages(userToken);
    if(!list.length)throw new Error('Nenhuma Página do Facebook administrada por esta conta foi encontrada.');
    await storePages(list);
    if(list.length===1)await selectPage(list[0].id);
    return res.redirect(`/admin.html?marketing=connected${list.length>1?'&choose=1':''}`);
  }catch(error){
    console.error('marketing-meta-callback',error);
    const reason=encodeURIComponent(String(error.message||'Falha ao conectar com a Meta.').slice(0,180));
    return res.redirect(`/admin.html?marketing=error&reason=${reason}`);
  }
};