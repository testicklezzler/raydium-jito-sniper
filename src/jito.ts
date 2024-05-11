import { config } from './config';
import { wallet } from '../settings';
import { geyserClient as jitoGeyserClient } from 'jito-ts';

import {
  SearcherClient,
  searcherClient as jitoSearcherClient,
} from 'jito-ts/dist/sdk/block-engine/searcher.js';

const BLOCK_ENGINE_URLS = config.get('block_engine_urls');

const GEYSER_URL = config.get('geyser_url');
const GEYSER_ACCESS_TOKEN = config.get('geyser_access_token');


const searcherClients: SearcherClient[] = [];

for (const url of BLOCK_ENGINE_URLS) {
  const client = jitoSearcherClient(url, wallet, {
    'grpc.keepalive_timeout_ms': 4000,
  });
  searcherClients.push(client);
}

const geyserClient = jitoGeyserClient(GEYSER_URL, GEYSER_ACCESS_TOKEN, {
  'grpc.keepalive_timeout_ms': 4000,
});

// all bundles sent get automatically forwarded to the other regions.
// assuming the first block engine in the array is the closest one
const searcherClient = searcherClients[0];

export { searcherClient, searcherClients, geyserClient };