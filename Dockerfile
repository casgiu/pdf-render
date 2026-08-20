FROM node:20-slim
# glibc (plutôt qu'alpine/musl) pour une compatibilité fiable avec les binaires
# précompilés de sharp (traitement d'images du générateur de catalogue PDF).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates poppler-utils \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
