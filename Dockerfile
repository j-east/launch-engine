FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=5566
EXPOSE 5566
CMD ["node", "server.mjs"]
