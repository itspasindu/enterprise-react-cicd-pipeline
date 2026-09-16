# Runtime image for the CI-built Vite dist (build-once).
# Non-root nginx (port 8080) so deploy can use --cap-drop ALL + --read-only.
# Local: npm run build && docker build -t platform:local .
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

# Unprivileged image listens on 8080 (not 80)
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
