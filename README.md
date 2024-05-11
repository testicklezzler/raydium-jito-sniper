# Solana Raydium Sniper Bot with Jito Support

![Build Passing](https://img.shields.io/badge/build-passing-brightgreen)
![Tests Passing](https://img.shields.io/badge/tests-passing-brightgreen)

Experience high-performance sniping on the Solana blockchain with integrated Jito support. This bot simplifies the process, eliminating the need for separate keypairs for trading and Jito operations.

## Features

- **Single Keypair Usage**: Use your key for both Jito and trading.
- **Jito Integration**: Leverages Jito for rapid transaction processing.
- **Ease of Use**: Simple setup and operation with comprehensive configuration options.

## Costs Per Transaction

Utilizing Jito for accelerated transaction processing incurs an additional fee of 0.015 SOL per transaction.
**Due to high initial buy slippage to secure early positions, a minimum of 0.1 SOL per transaction is recommended for profitability.**

## Setup Instructions

1. Ensure your wallet has a minimum of 1 SOL for multiple transaction attempts including Jito fees.
2. Install dependencies:
   ```bash
   npm install
   ````
3. Configure settings by editing **./settings.ts** with the necessary details.
4. Set up the appropriate block engine in **./src/config.ts**. Default is set to **frankfurt.mainnet.block-engine.jito.wtf**. For example, change to ny.mainnet.block-engine.jito.wtf if your server is closer to New York.
5. Execute the bot:
```bash
ts-node snipe.ts
```

## Usage

Run the bot continuously, extracting profits daily to maximize your investment's potential.

## Additional Tools and Community Support

Join our Discord community for support and access to more tools like Jito pool bundling scripts, volume bots, maker bots, and other resources for token launches.

## Discord Server

https://discord.gg/rn84eaRv7Y

My Discord Handle: testicklez

## Roadmap
- Implement auto-sell functionality.
- Introduce order book-based stop-loss features.
- We welcome contributions and suggestions from the community to enhance this bot further!