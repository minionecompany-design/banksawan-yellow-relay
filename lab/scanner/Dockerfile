FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
EXPOSE 9876
ENV NODE_ENV=production PORT=9876 LAB_LIVE_SHADOW_ENABLED=false LAB_PUBLICATION_ENABLED=false LAB_MAX_TRACKED=8
CMD ["node","src/server.js"]
