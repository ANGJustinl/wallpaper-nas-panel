FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS build

WORKDIR /workspace

COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared ./packages/shared
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/

WORKDIR /workspace/apps/web
RUN npm ci

WORKDIR /workspace
COPY apps/web ./apps/web

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /workspace/apps/web
RUN npm run build

FROM docker.m.daocloud.io/library/nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
