FROM node:20-alpine

# Prisma engine (linux-musl-openssl-3.0.x) needs openssl on alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
# prisma schema install-এর আগে দরকার (client generate)
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .

# Production build। TypeScript → dist/ । লোকালে docker-compose.yml-এর
# `command:` এই CMD-কে override করে, তাই লোকাল watch-mode অক্ষত থাকে।
RUN npm run build

ENV NODE_ENV=production

EXPOSE 4000

# `migrate deploy` — আগে থেকে লেখা migration গুলো চালায়, নতুন কিছু বানায় না,
# ডেটা মোছে না। (`migrate dev` কখনো নয় — ওটা DB reset করতে পারে।)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
