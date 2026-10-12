FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY customer/package.json ./customer/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace customer --include-workspace-root=false

COPY customer ./customer
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace customer

FROM nginx:1.27-alpine

COPY customer/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/customer/dist /usr/share/nginx/html

EXPOSE 80
