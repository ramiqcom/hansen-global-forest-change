FROM node:20-alpine

RUN apt-get update -y --fix-missing && apt-get upgrade -y

WORKDIR /usr/src/app

COPY . .

RUN npm update --save && npm install && npm run build

EXPOSE 3000

CMD [ "npm", "run", "start", "--", "--port", "3000" ]
