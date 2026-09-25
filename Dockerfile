# Runtime image for the CI-built Vite dist (build-once).
# Non-root nginx (port 8080) so deploy can use --cap-drop ALL + --read-only.
# Local: npm run build && docker build -t platform:local .
FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS runtime

USER root
# CACHE_BUST changes every CI run so apk upgrade is never served from a stale layer.
ARG CACHE_BUST=manual
# Keep OS packages current for Trivy HIGH/CRITICAL gates (e.g. libexpat CVE-2026-93990).
# Require the fixed package so the build fails closed if Alpine has not published it yet.
RUN echo "cache-bust=${CACHE_BUST}" \
  && apk upgrade --no-cache \
  && apk add --no-cache --upgrade 'libexpat>=2.8.5-r0' \
  && echo "Installed libexpat:" \
  && apk info -v libexpat \
  && apk info -v libexpat | grep -E '^libexpat-2\.(8\.[5-9]|9\.|[1-9][0-9]+\.)'
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
USER 101

# Unprivileged image listens on 8080 (not 80)
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
