FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --omit=dev

COPY server ./server

EXPOSE 3001
CMD ["node_modules/.bin/tsx", "./server/api.ts"]
