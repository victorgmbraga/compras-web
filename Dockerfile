FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
ENV HOST=0.0.0.0 PORT=8000
EXPOSE 8000
USER node
CMD ["node", "--max-old-space-size=512", "src/server.js"]
