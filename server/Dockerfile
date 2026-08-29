FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY customer/package.json ./customer/package.json
COPY operations/package.json ./operations/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace server --include-workspace-root=false --omit=dev

COPY server ./server
WORKDIR /app/server

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
