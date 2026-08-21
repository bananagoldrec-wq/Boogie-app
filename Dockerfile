# Imagem da API do coach — serve pra Fly, Railway, Cloud Run ou qualquer
# lugar que rode container. A chave entra como variável de ambiente na
# hospedagem (ANTHROPIC_API_KEY), nunca na imagem.
FROM node:22-slim

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server ./server
# o servidor usa a mesma lista de níveis e temas do app
COPY js/coach/content.js ./js/coach/content.js

ENV COACH_STATIC=0
ENV PORT=8787
EXPOSE 8787

CMD ["node", "server/index.mjs"]
