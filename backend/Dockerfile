# ── Stage 1: Install dependencies ──
FROM oven/bun:1-alpine AS builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# ── Stage 2: Runtime ──
FROM oven/bun:1-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
# Copy only the code the API runs. Never `COPY . .`: that baked .env backups and the TLS
# private keys (certificates/letsencrypt/acme.json) into the image.
COPY package.json ./
COPY src ./src
COPY shared ./shared

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "src/index.js"]
