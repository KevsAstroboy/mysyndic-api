FROM node:22-alpine

RUN apk add --no-cache openssl libssl1.1 libcrypto1.1 --repository=http://dl-cdn.alpinelinux.org/alpine/v3.18/community

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .

RUN npx prisma generate || true

EXPOSE 3000
CMD ["npm", "run", "start:dev"]