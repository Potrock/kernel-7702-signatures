"use client";

import { zeroAddress, Address, parseErc6492Signature } from "viem";
import { useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { useZeroDevKernel } from "./useZeroDevKernel";
  
  export const Zerodev = () => {
    const { wallets } = useWallets();
    const { account, kernelClient, initializing, chain, publicClient } = useZeroDevKernel();
    const [loading, setLoading] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [signError, setSignError] = useState<string | null>(null);
    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy"
    );
  
    return (
      <>
        <p className="mt-6 font-bold uppercase text-sm text-gray-600">
          Zerodev Delegation + Flow
        </p>
        <div className="mt-2 flex gap-4 flex-wrap">
          <button
            onClick={async () => {
              if (!kernelClient) {
                console.log("Kernel client not ready");
                return;
              }
              setLoading(true);
              try {
                const userOpHash = await kernelClient.sendUserOperation({
                  calls: [{ to: zeroAddress, value: BigInt(0), data: "0x" }],
                });

                const { receipt } =
                  await kernelClient.waitForUserOperationReceipt({
                    hash: userOpHash,
                  });

                setTxHash(receipt.transactionHash);
              } catch (e) {
                console.log(e);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading || initializing || !kernelClient}
            className="text-sm bg-violet-600 hover:bg-violet-700 py-2 px-4 rounded-md text-white border-none"
          >
            Delegate & Send Transaction
          </button>

          <button
            onClick={async () => {
              if (!kernelClient || !account || !publicClient) {
                console.log("Kernel not ready");
                return;
              }
              try {
                setSignError(null);
                const domain = {
                  name: "Kernel-7702 Test",
                  version: "1",
                  chainId: chain.id,
                  verifyingContract: zeroAddress,
                } as const;

                const types = {
                  Person: [
                    { name: "name", type: "string" },
                    { name: "wallet", type: "address" },
                  ],
                  Mail: [
                    { name: "from", type: "Person" },
                    { name: "to", type: "Person" },
                    { name: "contents", type: "string" },
                  ],
                } as const;

                const message = {
                  from: {
                    name: "Alice",
                    wallet: (embeddedWallet?.address as Address) || (account.address as Address),
                  },
                  to: { name: "Bob", wallet: zeroAddress as Address },
                  contents: "Hello from EIP-712!",
                } as const;

                const signature = await kernelClient.signTypedData({
                 account,
                 domain,
                  types,
                  primaryType: "Mail",
                  message,
                });

                console.log("signature", signature);

                const parsedSignature = parseErc6492Signature(signature);

                console.log("parsedSignature", parsedSignature);

                const isValid = await publicClient.verifyTypedData({
                  address: account.address,
                  domain,
                  types,
                  primaryType: "Mail",
                  message,
                  signature: signature,
                });

                console.log("typedDataSignature", signature);
                console.log("isValidSignature", isValid);
                if (!isValid) throw new Error("Signature verification failed");
              } catch (err) {
                console.error(err);
                setSignError(err instanceof Error ? err.message : String(err));
              }
            }}
            className="text-sm bg-gray-200 hover:bg-gray-300 py-2 px-4 rounded-md text-gray-900 border-none"
          >
            Sign & Verify Typed Data
          </button>
          {signError && (
            <p className="text-sm text-red-600">{signError}</p>
          )}
        </div>
        {!!txHash && (
          <a href={`${chain.blockExplorers.default.url}/tx/${txHash}`}>
            Success! View transaction
          </a>
        )}
      </>
    );
  };