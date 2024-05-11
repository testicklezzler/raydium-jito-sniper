FROM mcr.microsoft.com/devcontainers/javascript-node:20-bullseye

WORKDIR /workspace/

COPY . .

RUN apt-get update && apt-get install -y \
  curl \
  git \
  gnupg2 \
  jq \
  sudo \
  vim \
  build-essential \
  openssl \
  libssl-dev \
  pkg-config

RUN npm install -g yarn

# confirm installation
RUN node -v
RUN npm -v

