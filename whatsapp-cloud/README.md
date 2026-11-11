# JP Leilões WhatsApp Cloud — TESTE

Gateway persistente para validar o fluxo sem instalador no computador do cliente.

## Segurança do teste

- Trabalhar somente na branch `teste-whatsapp-cloud`.
- Não apontar `jpleiloes.com.br` para este serviço até os testes reais passarem.
- Cada empresa usa um código de dispositivo próprio.
- Tokens persistidos são criptografados com `GATEWAY_SECRET`.
- Sessões do Baileys ficam em `SESSION_ROOT`, que deve estar em um volume persistente no Railway.
- CORS fica limitado por `ALLOWED_ORIGINS`.

## Variáveis obrigatórias

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GATEWAY_SECRET` (mínimo 32 caracteres)
- `ALLOWED_ORIGINS`
- `SESSION_ROOT=/data/sessions`

## Testes antes de produção

1. Health check responde.
2. Código de dispositivo inválido é recusado.
3. Código válido gera QR.
4. QR conecta uma conta de teste.
5. Grupos são carregados.
6. Reiniciar o serviço e confirmar reconexão sem novo QR.
7. Simular envio de lote com foto + legenda para um grupo de teste.
8. Testar duas empresas/sessões isoladas.
9. Desconectar e confirmar limpeza da sessão.
10. Só então integrar o painel do JP Leilões.
