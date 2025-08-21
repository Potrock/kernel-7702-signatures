Kernel + Privy + 7702 Signature Reproduction

1. Fill out .env. See .env.example. You will need a paid ZeroDev API Key for base access, a 0x Api key, and a default privy app with embedded ethereum wallets.

2. Try various transaction types

Delegate & Send a dummy transaction (This works)

Sign and Verify Typed Data (this does not work, using Viem's verifyTypedData)

Approve USDC for Permit2 (this works)

Swap 1 USDC for ETH on Base using Kernel and 0x Permit2 method (this does not work -- signature validation fails with revert code `0x682a6e7c` - InvalidValidator()). We get the same issue any time we use a permit2 signature onchain using this setup.
