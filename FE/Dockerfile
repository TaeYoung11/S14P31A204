FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_KAKAO_MAP_API_KEY
ARG VITE_API_URL

ENV VITE_KAKAO_MAP_API_KEY=$VITE_KAKAO_MAP_API_KEY
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80