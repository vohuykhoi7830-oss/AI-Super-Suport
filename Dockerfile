# ── Bước 1: Build ──────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /app

# Copy file project và restore dependencies
COPY knowlegle.csproj ./
RUN dotnet restore knowlegle.csproj

# Copy toàn bộ source code
COPY . ./

# Build và publish — chỉ định thẳng .csproj, bỏ qua .sln
RUN dotnet publish knowlegle.csproj -c Release -o out

# ── Bước 2: Runtime ─────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Copy từ bước build
COPY --from=build /app/out ./

# KHÔNG hardcode port ở đây — Railway sẽ inject $PORT lúc chạy
# Program.cs sẽ đọc $PORT và set URL động
EXPOSE 8080

ENTRYPOINT ["dotnet", "knowlegle.dll"]
