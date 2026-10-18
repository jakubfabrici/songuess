FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY game.js server.js ./
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV DB_PATH=/data/songuess.db PORT=3000
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
