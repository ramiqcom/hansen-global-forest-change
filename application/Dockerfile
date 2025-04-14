# Using debian sid to get the latest GDAL version (>3.10)
FROM gcr.io/ramadhan-s4g/eo-base:latest

# Change working directory
WORKDIR /usr/src/app

# Copy the data from source to the image
COPY . .

# Install packages in frontend
RUN npm update --save --prefix frontend && \
    npm install --prefix frontend && \
    npm run build --prefix frontend

# and backend
RUN npm update --save --prefix backend && \
    npm install --prefix backend

# Expose port 3000 and 8000 to the external
EXPOSE 3000 8000
