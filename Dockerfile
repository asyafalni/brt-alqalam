# A static SPA, served by nginx.
#
# THE BUILD CONTEXT IS THE REPO ROOT, not `app/`. The UI imports the pure domain and the data
# adapters from outside its own directory (`../../../../domain/...`), which is the whole point of
# the hexagonal split — so a Dockerfile that only copied `app/` would fail at the first import.

# Debian, NOT alpine, for the BUILD stage. Octane's compiler ships a native Node addon
# (`@oxc-tsrx/native-*`) that npm resolves to the musl build on alpine, and it then fails to load
# because the binary actually links against glibc's `ld-linux-x86-64.so.2`. The error arrives as
# 31 parser failures, which reads like broken source rather than a wrong base image.
FROM node:24-slim AS build
WORKDIR /src

# Dependencies first, and only the manifests: this layer is cached until they actually change,
# so an ordinary edit rebuilds in seconds instead of re-resolving 555 packages.
COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci

# The pure core and its adapters travel with the UI — they are compiled INTO the bundle, not
# installed from a registry.
COPY domain ./domain
COPY data ./data
COPY app ./app

RUN cd app && npm run build


FROM nginx:1.27-alpine AS serve
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/app/dist /usr/share/nginx/html

# 8080, not 80: Fly's convention, and a port above 1024 is one fewer reason to need root.
EXPOSE 8080
