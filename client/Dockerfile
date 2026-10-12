FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY customer/package.json ./customer/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace client --include-workspace-root=false

COPY client ./client
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace client
# Empaquetar el resultado evita que Docker Desktop sobre OneDrive materialice
# archivos de la capa de build con longitud cero al copiarlos a Nginx.
RUN tar -czf /tmp/client-dist.tgz -C /app/client/dist .

FROM nginx:1.27-alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /tmp/client-dist.tgz /tmp/client-dist.tgz
RUN rm -rf /usr/share/nginx/html/* \
  && tar -xzf /tmp/client-dist.tgz -C /usr/share/nginx/html \
  && rm /tmp/client-dist.tgz \
  && test -s /usr/share/nginx/html/index.html

EXPOSE 80
