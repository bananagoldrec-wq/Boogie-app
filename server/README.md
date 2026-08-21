# coach · servidor

Guarda a chave da Anthropic e fala com o Claude pelo app. O navegador só
conhece `/api/*`.

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
npm start          # app + API em http://localhost:8787/coach.html
```

Sem chave o servidor sobe do mesmo jeito e responde `503` nas rotas do
professor — o app percebe e usa o professor local.

Documentação completa (variáveis, rotas, deploy separado): [`../docs/COACH.md`](../docs/COACH.md).
