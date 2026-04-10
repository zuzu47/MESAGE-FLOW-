FROM node:20-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Backend deps
COPY package.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

# Frontend build
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install --legacy-peer-deps

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Backend source
COPY src/ ./src/

RUN mkdir -p /data/sessions /data/uploads

ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "src/index.js"]
