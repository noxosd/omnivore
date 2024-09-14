FROM node:18.16-alpine

WORKDIR /app

# COPY package.json .
# COPY yarn.lock .
COPY pkg/admin/ /app

RUN yarn install --frozen-lockfile

RUN NODE_ENV=production yarn build

ENV PORT=8080
EXPOSE 8080

ENV NODE_ENV production

CMD yarn start
