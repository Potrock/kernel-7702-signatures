"use client";

import { useState } from "react";
import { useZeroDevKernel } from "./useZeroDevKernel";
import {
  erc20Abi,
  encodeFunctionData,
  maxUint256,
  numberToHex,
  concat,
  Hex,
  Address,
  type TypedData,
  type TypedDataDomain,
} from "viem";

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

type ZeroXPermit2Eip712 = {
  domain: TypedDataDomain;
  types: TypedData;
  primaryType: string;
  message: Record<string, unknown>;
};

type ZeroXQuote = {
  permit2: {
    eip712: ZeroXPermit2Eip712;
  };
  transaction: {
    to: Address;
    data: Hex;
    gas?: string | number | null;
    value?: string | number | null;
  };
};

export const ZeroXSwap = () => {
  const { account, kernelClient, initializing, chain } = useZeroDevKernel();
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvePermit2 = async () => {
    if (!kernelClient) return;
    setBusy(true);
    setError(null);
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PERMIT2_ADDRESS, maxUint256],
      });

      const userOpHash = await kernelClient.sendUserOperation({
        calls: [{ to: USDC_ADDRESS, data }],
      });

      const { receipt } = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      setTxHash(receipt.transactionHash);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const swapUsdcToEth = async () => {
    if (!kernelClient || !account) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/swap?wallet=${account.address}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
      const quote: ZeroXQuote = await res.json();

      const { eip712 } = quote.permit2;
      const typedTypes = eip712.types as TypedData;
      const typedPrimary = eip712.primaryType as keyof typeof typedTypes & string;
      const signature = await kernelClient.signTypedData({
        account,
        domain: eip712.domain,
        types: typedTypes,
        primaryType: typedPrimary,
        message: eip712.message as Record<string, unknown>,
      });

      const signatureByteLen = (signature.length - 2) / 2;
      const signatureLengthInHex = numberToHex(signatureByteLen, { size: 32 });
      const transactionData = concat([
        quote.transaction.data,
        signatureLengthInHex as Hex,
        signature as Hex,
      ]);

      const userOpHash = await kernelClient.sendUserOperation({
        calls: [
          {
            to: quote.transaction.to,
            data: transactionData,
            value: quote.transaction.value
              ? BigInt(quote.transaction.value)
              : undefined,
          },
        ],
      });

      const { receipt } = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      setTxHash(receipt.transactionHash);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-3">
      <p className="font-bold uppercase text-sm text-gray-600">0x Swap</p>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={approvePermit2}
          disabled={busy || initializing || !kernelClient}
          className="text-sm bg-gray-200 hover:bg-gray-300 py-2 px-4 rounded-md text-gray-900 border-none disabled:opacity-60"
        >
          Approve USDC (Permit2)
        </button>
        <button
          onClick={swapUsdcToEth}
          disabled={busy || initializing || !kernelClient || !account}
          className="text-sm bg-emerald-600 hover:bg-emerald-700 py-2 px-4 rounded-md text-white border-none disabled:opacity-60"
        >
          Swap 1 USDC → ETH
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!!txHash && (
        <a
          className="text-sm text-blue-600 underline"
          href={`${chain.blockExplorers.default.url}/tx/${txHash}`}
        >
          View transaction
        </a>
      )}
    </div>
  );
};


