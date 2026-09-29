# Stage 1: build the frontend
FROM node:20-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the native C modules (native/). Same Debian release as the
# aspnet runtime image below, so the shared libraries link against the same glibc.
# libiban is built when its sources exist (native/libiban); until then the API uses
# its managed IBAN validator.
FROM debian:bookworm-slim AS native-build
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc make libc6-dev libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/native
COPY native/ ./
RUN make libcsvparser.so \
    && if [ -d libiban ]; then make libiban.so; fi \
    && mkdir -p /out && cp lib*.so /out/

# Stage 3: build the backend
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src
COPY backend/SebPortal.Api/SebPortal.Api.csproj backend/SebPortal.Api/
RUN dotnet restore backend/SebPortal.Api/SebPortal.Api.csproj
COPY backend/SebPortal.Api/ backend/SebPortal.Api/
RUN dotnet publish backend/SebPortal.Api/SebPortal.Api.csproj -c Release -o /app/publish

# Stage 4: runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# OpenMP runtime for libcsvparser.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

USER 1654

COPY --from=backend-build /app/publish .
COPY --from=native-build /out/ ./
COPY --from=frontend-build /src/frontend/dist ./wwwroot

ENV ASPNETCORE_URLS=http://+:8081
EXPOSE 8081

ENTRYPOINT ["dotnet", "SebPortal.Api.dll"]
