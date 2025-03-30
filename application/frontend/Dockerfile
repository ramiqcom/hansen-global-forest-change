# Using node 20
FROM node:20-alpine

# Change working directory
WORKDIR /usr/src/app

# Copy the data
COPY . .

# Install npm packages and build the app
RUN npm install && npm run build

# Expose port 3000 to the external
EXPOSE 3000

# Run the app
CMD npm run start -- --port 3000
