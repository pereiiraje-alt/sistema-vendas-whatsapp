FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-fund --no-audit

COPY index.js ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm","start"]
