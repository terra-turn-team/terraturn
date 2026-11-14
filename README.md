# TerraTurn

PWA que usa dados da NASA para comparar estratégias de rotação de culturas — NASA Space Apps 2026 (Field Shift).

## Executar com Docker Compose

Na raiz do projeto, crie uma chave local para as sessões e inicie os serviços:

```powershell
$secret = python -c "import secrets; print(secrets.token_urlsafe(48))"
Set-Content .env "JWT_SECRET=$secret"
docker compose up --build
```

Abra http://localhost:5173. A API fica disponível em http://localhost:8000 e o banco SQLite é mantido no volume `backend-data`.

O arquivo `.env` é local e ignorado pelo Git. Esta configuração é para desenvolvimento; não reutilize a chave local em produção. Para parar os serviços, pressione `Ctrl+C` e execute `docker compose down`.
