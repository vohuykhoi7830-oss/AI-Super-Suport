# ── Bước 1: Build ──────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /app

COPY knowlegle.csproj ./
RUN dotnet restore knowlegle.csproj

COPY . ./

RUN dotnet publish knowlegle.csproj -c Release -o out

# ── Bước 2: Runtime ─────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

COPY --from=build /app/out ./

EXPOSE 8080

# Dùng CMD thay ENTRYPOINT — Railway sẽ không override bằng node runner
CMD ["dotnet", "knowlegle.dll"]
