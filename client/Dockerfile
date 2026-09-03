FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY customer/package.json ./customer/package.json
COPY operations/package.json ./operations/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace client --include-workspace-root=false

COPY client ./client
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_OPERATIONS_URL
ENV VITE_OPERATIONS_URL=$VITE_OPERATIONS_URL
RUN npm run build --workspace client

FROM nginx:1.27-alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
