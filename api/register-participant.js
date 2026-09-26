const SUPABASE_URL = 'https://dsgnyfnddyxilakjwavu.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { companyId, email, password, fullName, cpf, phone } = body;
    if (!companyId || !email || !password || !fullName || !cpf || !phone) return res.status(400).json({ error: 'Preencha todos os campos.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers,
      body: JSON.stringify({ email: String(email).trim().toLowerCase(), password, email_confirm: true, user_metadata: { full_name: String(fullName).trim() } })
    });
    const auth = await authResp.json();
    if (!authResp.ok) return res.status(authResp.status >= 500 ? 502 : 400).json({ error: auth.msg || auth.message || auth.error_description || 'Não foi possível criar o usuário.' });

    const participantResp = await fetch(`${SUPABASE_URL}/rest/v1/participants`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ company_id: companyId, auth_user_id: auth.id, full_name: String(fullName).trim(), cpf: String(cpf).trim(), phone: String(phone).trim(), email: String(email).trim().toLowerCase(), status: 'approved' })
    });
    const participants = await participantResp.json();
    if (!participantResp.ok) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${auth.id}`, { method: 'DELETE', headers }).catch(() => {});
      return res.status(400).json({ error: participants.message || participants.details || 'Não foi possível salvar o participante.' });
    }

    return res.status(201).json({ participant: Array.isArray(participants) ? participants[0] : participants });
  } catch (error) {
    console.error('register-participant', error);
    return res.status(500).json({ error: 'Erro interno ao realizar o cadastro.' });
  }
};