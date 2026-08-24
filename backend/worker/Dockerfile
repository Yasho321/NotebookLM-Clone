FROM node:22-alpine AS builder
WORKDIR /app/worker

# Install worker dependencies
COPY worker/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/worker/node_modules ./node_modules
COPY shared/ ./shared/
COPY worker/ ./worker/

ENV NODE_ENV=production
CMD ["node", "worker/index.js"]
