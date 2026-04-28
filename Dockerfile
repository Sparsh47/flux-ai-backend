FROM node:22 AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm install

COPY . .

# create a dummy .env just for the build stage
RUN echo "DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder" > .env

RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN npm ci --only=production

# real DATABASE_URL comes from docker-compose env_file at runtime
RUN echo "DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder" > .env
RUN npx prisma generate

# remove the dummy .env so it can't be read at runtime
RUN rm .env

EXPOSE 8000

ENTRYPOINT ["node"]
CMD ["dist/server.js"]