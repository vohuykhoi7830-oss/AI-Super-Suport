# ── Bước 1: Build ──────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /app

# Copy file project và restore dependencies
COPY *.csproj ./
RUN dotnet restore

# Copy toàn bộ source code
COPY . ./

# Build và publish
RUN dotnet publish -c Release -o out

# ── Bước 2: Runtime ─────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Copy từ bước build
COPY --from=build /app/out ./

# Railway dùng PORT env variable
ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000

# Chạy app — đúng tên file .dll của bạn
ENTRYPOINT ["dotnet", "knowlegle.dll"]
