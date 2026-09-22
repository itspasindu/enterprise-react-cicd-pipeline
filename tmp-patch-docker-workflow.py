from pathlib import Path

path = Path(".github/workflows/reusable-docker.yml")
text = path.read_text(encoding="utf-8")

old = """      - name: Build API candidate
        id: api
        uses: docker/build-push-action@471d1dc4e07e5cdedd4c2171150001c434f0b7a4 # v6.15.0
        with:
          context: server
          load: true
          tags: ${{ steps.meta.outputs.api_tags }}
          cache-from: type=gha,scope=platform-api
          cache-to: type=gha,mode=max,scope=platform-api
          labels: |
            org.opencontainers.image.title=${{ inputs.release-prefix }}-api
            org.opencontainers.image.version=${{ steps.meta.outputs.version }}
            org.opencontainers.image.revision=${{ github.sha }}
          provenance: false

      - name: Scan web image"""

new = """      - name: Build API candidate
        id: api
        uses: docker/build-push-action@471d1dc4e07e5cdedd4c2171150001c434f0b7a4 # v6.15.0
        with:
          context: server
          load: true
          tags: ${{ steps.meta.outputs.api_tags }}
          cache-from: type=gha,scope=platform-api
          cache-to: type=gha,mode=max,scope=platform-api
          no-cache-filter: runtime
          labels: |
            org.opencontainers.image.title=${{ inputs.release-prefix }}-api
            org.opencontainers.image.version=${{ steps.meta.outputs.version }}
            org.opencontainers.image.revision=${{ github.sha }}
          provenance: false

      - name: Assert API image has no package managers
        env:
          API_IMAGE: ${{ steps.meta.outputs.api_image }}:${{ steps.meta.outputs.version }}
        run: |
          set -euo pipefail
          docker run --rm --entrypoint sh "$API_IMAGE" -ec '
            command -v node >/dev/null
            test ! -e /usr/local/lib/node_modules/npm
            test ! -e /usr/local/lib/node_modules/corepack
            test ! -e /opt/yarn-v1.22.22
            if command -v npm >/dev/null 2>&1; then echo "npm must not exist" >&2; exit 1; fi
            if command -v yarn >/dev/null 2>&1; then echo "yarn must not exist" >&2; exit 1; fi
            if command -v corepack >/dev/null 2>&1; then echo "corepack must not exist" >&2; exit 1; fi
          '

      - name: Scan web image"""

if old not in text:
    raise SystemExit("pattern not found")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("updated reusable-docker.yml")
