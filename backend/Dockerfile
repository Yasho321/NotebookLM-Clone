FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev


FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
EXPOSE 8080


CMD ["npm", "start"]