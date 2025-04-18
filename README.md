## Webmap and Tile Server to Visualize and Analyze Hansen Global Forest Change 2023 v1.11

### Introduction

Hi! This repository contain the application scripts to create a [webmap (front-end)](application/frontend) and [tile server (back-end)](application/backend) to visualize [Hansen Global Forest Change 2023 v1.11](https://storage.googleapis.com/earthenginepartners-hansen/GFC-2023-v1.11/download.html) data which is [published by Hansen, Potapov, Moore, Hancher et al.](http://www.sciencemag.org/content/342/6160/850). The difference than the version in the source [download page](https://storage.googleapis.com/earthenginepartners-hansen/GFC-2023-v1.11/download.html) is that the data are retiled into Cloud Optimized GeoTIFF (COG) which can be served on the web without downloading the whole image.

### How the application work?

This webmap is made on top of [NextJS](https://nextjs.org/) framework and [MapLibre](https://maplibre.org/) for the web map library. The tile server is made using [Fastify](https://fastify.dev/) web framework where the request of tilejson with tiles format of /{z}/{x}/{y} from the webmap is send to the server. The XYZ tile format then translated into a bounding box generated from [mercantile](https://github.com/mapbox/mercantile). This bounding box then used to filter the tiles from [my hansen tile collection](https://storage.googleapis.com/gee-ramiqcom-bucket/cog_catalog/collections_tiles/hansen_gfc_tiles.geojson) that will refer to a Hansen GFC layer in my cloud storage.

All the layers will be clipped, mosaicked, and converted into a WEBP format with [GDAL](https://gdal.org/en/stable/index.html). GDAL that I used is the CLI version directly run on the terminal with modified version of [NodeJS child process exec](https://nodejs.org/docs/latest/api/child_process.html) that I [promisified](application/backend/src/modules/server_util.ts).

This application can also be used to analyze your region of interest where you upload the GeoJSON then the application will calculated the forest cover from 2000 to 2023 on which you can see the chart and download the table. Accompanying that, you can also download the layer using your region of interest.

### How to run the application?

To run the application as intended in your local. Make sure that you already installed:

1. [Docker](https://www.docker.com/) and [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) (if you are using Windows) so that you can the application without worrying about depedencies and installing many packages;
2. [Git](https://git-scm.com/) to clone this repository.

Then, you will have to:

1. Clone this repository to your machine. Run this on your terminal `git clone https://github.com/ramiqcom/hansen-global-forest-change`.
2. Change the filename of [`application/backend/.env.example`](application/backend/.env.example) to `application/backend/.env`.
3. Change the filename of [`application/frontend/.env.example`](application/frontend/.env.example) to `application/frontend/.env`.
4. Open the new renamed `application/frontend/.env` file and change the value of `STADIA_API_KEY` to your own Stadia Maps API Key. If you are using local machine you don't have to change the `COG_SERVER` value but if you are using another machine for the backend then you need to change it accordingly.
5. Change the working directory to the [`application`](application) folder. Example using `cd application`.
6. Run the Docker Desktop.
7. Run in the terminal `docker compose up --build` to build and run the application.
8. Open the application in `http://localhost:3000` if you running it in your local machine.

### Credits

This application is created by [Ramadhan](https://github.com/ramiqcom).
