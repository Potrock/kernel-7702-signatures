"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  Hex,
  http,
} from "viem";
import { base } from "viem/chains";
import { useSign7702Authorization, useWallets } from "@privy-io/react-auth";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  getEntryPoint,
  KERNEL_V3_3_BETA,
  KernelVersionToAddressesMap,
} from "@zerodev/sdk/constants";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";

const bundlerRpc = process.env.NEXT_PUBLIC_BUNDLER_RPC;
const paymasterRpc = process.env.NEXT_PUBLIC_PAYMASTER_RPC;

const chain = base;
const kernelVersion = KERNEL_V3_3_BETA;
const entryPoint = getEntryPoint("0.7");
const publicClient = createPublicClient({
  chain,
  transport: http(),
});

type KernelAccount = Awaited<ReturnType<typeof createKernelAccount>>;
type KernelClient = ReturnType<typeof createKernelAccountClient>;

export function useZeroDevKernel() {
  const { wallets } = useWallets();
  const { signAuthorization } = useSign7702Authorization();
  const [account, setAccount] = useState<KernelAccount | null>(null);
  const [kernelClient, setKernelClient] = useState<KernelClient | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const embeddedWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === "privy"),
    [wallets]
  );

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (!embeddedWallet) return;
      setInitializing(true);
      setError(null);
      try {
        const walletClient = createWalletClient({
          account: embeddedWallet.address as Hex,
          chain,
          transport: custom(await embeddedWallet.getEthereumProvider()),
        });

        const authorization = await signAuthorization({
          contractAddress:
            KernelVersionToAddressesMap[kernelVersion].accountImplementationAddress,
          chainId: chain.id,
        });

        const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
          signer: walletClient,
          entryPoint,
          kernelVersion,
        });

        const createdAccount = await createKernelAccount(publicClient, {
          plugins: { 
            sudo: ecdsaValidator
            // Only use sudo (ROOT) validator to avoid SECONDARY validator issues
          },
          entryPoint,
          kernelVersion,
          address: walletClient.account.address,
          eip7702Auth: authorization,
        });

        const paymasterClient = createZeroDevPaymasterClient({
          chain,
          transport: http(paymasterRpc),
        });

        const createdKernelClient = createKernelAccountClient({
          account: createdAccount,
          chain,
          bundlerTransport: http(bundlerRpc),
          paymaster: paymasterClient,
          client: publicClient,
        });

        if (!isMounted) return;
        setAccount(createdAccount);
        setKernelClient(createdKernelClient);
      } catch (e: unknown) {
        if (!isMounted) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
      } finally {
        if (!isMounted) return;
        setInitializing(false);
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, [embeddedWallet, signAuthorization]);

  return { account, kernelClient, initializing, error, chain, publicClient } as const;
}

export type UseZeroDevKernelResult = ReturnType<typeof useZeroDevKernel>;


