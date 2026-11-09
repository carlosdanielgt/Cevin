# Stage 1: Build static SPA bundle
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve on port 8080 with nginx-unprivileged (SPA fallback + gzip, no restrictive CSP)
FROM nginxinc/nginx-unprivileged:alpine AS runtime

USER root
RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 8080;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    include /etc/nginx/mime.types;
    types {
        application/javascript js mjs;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 256;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
USER nginx

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
