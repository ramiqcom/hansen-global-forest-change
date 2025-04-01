# Using debian sid to get the latest GDAL version (>3.10)
FROM debian:sid-slim

# Update the linux
RUN apt-get update -y --fix-missing && apt-get upgrade -y

# Install CURL and GDAL
RUN apt-get install -y curl gdal-bin libgdal-dev

# Install Nodejs 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh \
    && bash nodesource_setup.sh && apt-get install -y nodejs

# Change working directory
WORKDIR /usr/src/app

# Copy the data from source to the image
COPY . .

RUN npm update --save && npm install

# Expose port 3000 and 8000 to the external
EXPOSE 8000

CMD [ "npm", "start", "--", "--port", "8000" ]
