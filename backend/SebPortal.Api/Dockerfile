# Stage 1: build the frontend
FROM node:20-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the backend
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src
COPY backend/SebPortal.Api/SebPortal.Api.csproj backend/SebPortal.Api/
RUN dotnet restore backend/SebPortal.Api/SebPortal.Api.csproj
COPY backend/SebPortal.Api/ backend/SebPortal.Api/
RUN dotnet publish backend/SebPortal.Api/SebPortal.Api.csproj -c Release -o /app/publish

# Stage 3: runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

USER 1654

COPY --from=backend-build /app/publish .
COPY --from=frontend-build /src/frontend/dist ./wwwroot

ENV ASPNETCORE_URLS=http://+:8081
EXPOSE 8081

ENTRYPOINT ["dotnet", "SebPortal.Api.dll"]
