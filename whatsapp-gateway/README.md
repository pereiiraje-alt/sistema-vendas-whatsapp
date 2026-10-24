# JP Leilões WhatsApp Gateway

Gateway central para uso do WhatsApp pelo celular, sem instalador local.

## Variáveis de ambiente

- SUPABASE_URL
- SUPABASE_KEY
- GATEWAY_SECRET

## Deploy no Northflank

Use o diretório `whatsapp-gateway` como contexto de build e o `Dockerfile` desse diretório.
Exponha a porta 8080 e configure o health check em `/health`.

O serviço mantém sessões separadas por empresa, salva a sessão no Supabase e restaura automaticamente após reinícios.
