# Runtime image for the CI-built Vite dist (build-once).
# Non-root nginx (port 8080) so deploy can use --cap-drop ALL + --read-only.
# Local: npm run build && docker build -t platform:local .
FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS runtime

USER root
# Keep OS packages current for Trivy HIGH/CRITICAL gates (e.g. libexpat CVE-2026-93990).
RUN apk upgrade --no-cache \
  && apk add --no-cache --upgrade libexpat
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
USER 101

# Unprivileged image listens on 8080 (not 80)
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
