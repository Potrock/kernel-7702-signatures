"use client";

import { zeroAddress, Address, hashTypedData, keccak256, encodeAbiParameters, concat, recoverAddress, toHex, domainSeparator, stringToHex } from "viem";
import { useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { useZeroDevKernel } from "./useZeroDevKernel";

export const Zerodev = () => {
  const { wallets } = useWallets();
  const { account, kernelClient, initializing, chain, publicClient } =
    useZeroDevKernel();
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy"
  );

  const handleReadCode = async () => {
    if (!kernelClient || !publicClient || !account) return;
    
    try {
      const code = await publicClient.getCode({
        address: account.address
      });
      
      if (code && code !== '0x') {
        const is7702 = code.startsWith('0xef0100');
        console.log('Account code:', code);
        console.log('Is EIP-7702 active:', is7702);
        
        if (is7702) {
          console.log('EIP-7702 delegation detected! This account has delegated code.');
        } else {
          console.log('Regular contract code detected.');
        }
      } else {
        console.log('No code at address - this is an EOA without delegation.');
      }
    } catch (error) {
      console.error('Error reading code:', error);
    }
  };

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
          onClick={handleReadCode}
          disabled={initializing || !kernelClient || !account}
          className="text-sm bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded-md text-white border-none"
        >
          Check EIP-7702 Status
        </button>

        <button
          onClick={async () => {
            if (!kernelClient || !account || !publicClient) return;
            
            const testDomain = {
              name: "Kernel-7702 Test",
              version: "1",
              chainId: chain.id,
              verifyingContract: zeroAddress,
            } as const;

            const testTypes = {
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

            const testMessage = {
              from: {
                name: "Alice",
                wallet: account.address as Address,
              },
              to: { name: "Bob", wallet: zeroAddress as Address },
              contents: "Hello from EIP-712!",
            } as const;
            
            try {
              console.log("Testing kernel signature verification...");
              
              // Sign with kernel
              const kernelSig = await kernelClient.signTypedData({
                account,
                domain: testDomain,
                types: testTypes,
                primaryType: "Mail",
                message: testMessage,
              });
              
              console.log("Kernel signature:", kernelSig);
              
              // Parse and verify
              if (kernelSig.startsWith('0x01')) {
                const validatorAddress = '0x' + kernelSig.slice(4, 44) as Address;
                const actualSig = '0x' + kernelSig.slice(44) as `0x${string}`;
                
                console.log("Validator:", validatorAddress);
                console.log("Actual sig:", actualSig);
                
                // Hash the typed data
                const originalHash = hashTypedData({
                  domain: testDomain,
                  types: testTypes,
                  primaryType: "Mail",
                  message: testMessage,
                });
                
                // Recreate the exact wrapping that eip712WrapHash does
                // First, check what kernel version we're using (assuming 0.3.x based on features)
                // Step 1: Apply hashKernelMessageHashWrapper if version >= 0.3.0-beta
                const kernelHashWrapper = keccak256(
                  encodeAbiParameters(
                    [{ type: "bytes32" }, { type: "bytes32" }],
                    [keccak256(stringToHex("Kernel(bytes32 hash)")), originalHash]
                  )
                );
                
                // Step 2: Create domain separator for the kernel account
                // This needs to match the kernel's metadata
                const kernelDomain = {
                  name: "Kernel", // Standard kernel name
                  version: "0.3.3", // Match the KERNEL_V3_3_BETA version
                  chainId: testDomain.chainId,
                  verifyingContract: account.address, // The kernel account address
                };
                
                const _domainSeparator = domainSeparator({
                  domain: kernelDomain
                });
                
                // Step 3: Create the final EIP-712 digest
                const wrappedHash = keccak256(
                  concat(["0x1901", _domainSeparator, kernelHashWrapper])
                );
                
                console.log("Original hash:", originalHash);
                console.log("Kernel wrapped hash:", kernelHashWrapper);
                console.log("Domain separator:", _domainSeparator);
                console.log("Final wrapped hash:", wrappedHash);
                
                // Try to recover signer from the wrapped hash
                const recoveredAddress = await recoverAddress({
                  hash: wrappedHash,
                  signature: actualSig,
                });
                
                console.log("Recovered address:", recoveredAddress);
                console.log("Embedded wallet:", embeddedWallet?.address);
                console.log("Account address:", account.address);
                
                // Check if the recovered address matches any expected signer
                const isValidSigner = 
                  recoveredAddress.toLowerCase() === embeddedWallet?.address?.toLowerCase() ||
                  recoveredAddress.toLowerCase() === account.address.toLowerCase();
                
                console.log("✅ Signature is valid:", isValidSigner);
                
                if (isValidSigner) {
                  console.log("The kernel signature is cryptographically valid!");
                  console.log("Signer:", recoveredAddress);
                } else {
                  console.log("⚠️ Signature doesn't match expected signers");
                }
              }
            } catch (e) {
              console.error("Error:", e);
            }
          }}
          disabled={initializing || !kernelClient || !account}
          className="text-sm bg-green-600 hover:bg-green-700 py-2 px-4 rounded-md text-white border-none"
        >
          Test Kernel Sig Verification
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
                  wallet:
                    (embeddedWallet?.address as Address) ||
                    (account.address as Address),
                },
                to: { name: "Bob", wallet: zeroAddress as Address },
                contents: "Hello from EIP-712!",
              } as const;

              // For EOA, get the actual signer address
              const signerAddress = embeddedWallet?.address || account.address;
              
              console.log("Signing with address:", signerAddress);
              console.log("Account address:", account.address);
              
              const kernelSignature = await kernelClient.signTypedData({
                account,
                domain,
                types,
                primaryType: "Mail",
                message,
              });

              console.log("Kernel signature (with 0x01 prefix):", kernelSignature);

              // For simple EOA verification when no delegation is active
              // We need to sign directly with the embedded wallet
              let isValid = false;
              
              // Check if we have code at the account address
              const code = await publicClient.getCode({
                address: account.address
              });
              
              const hasCode = code && code !== '0x';
              console.log("Account has code:", hasCode);
              
              if (!hasCode && embeddedWallet) {
                // This is an EOA, sign directly with the embedded wallet
                console.log("Using direct EOA signing with embedded wallet");
                
                // Get the wallet provider and sign directly
                const provider = await embeddedWallet.getEthereumProvider();
                const directSignature = await provider.request({
                  method: 'eth_signTypedData_v4',
                  params: [
                    embeddedWallet.address,
                    JSON.stringify({
                      domain,
                      types,
                      primaryType: "Mail",
                      message,
                    })
                  ]
                }) as `0x${string}`;
                
                console.log("Direct EOA signature:", directSignature);
                
                // Verify the direct signature
                isValid = await publicClient.verifyTypedData({
                  address: embeddedWallet.address as Address,
                  domain,
                  types,
                  primaryType: "Mail",
                  message,
                  signature: directSignature,
                });
                
                console.log("Direct EOA verification:", isValid);
              } else {
                // Account has code or no embedded wallet, use kernel signature
                console.log("Using kernel signature (account has code or no embedded wallet)");
                console.log("Kernel signature:", kernelSignature);
                
                // Extract components from kernel signature
                if (kernelSignature.startsWith('0x01')) {
                  // Parse kernel signature: 0x01 + [20-byte validator] + [65-byte signature]
                  const validatorType = kernelSignature.slice(0, 4); // 0x01
                  const validatorAddress = '0x' + kernelSignature.slice(4, 44) as Address; // 20 bytes
                  const actualSignature = '0x' + kernelSignature.slice(44) as `0x${string}`; // Rest is the actual signature
                  
                  console.log("Parsed kernel signature:");
                  console.log("  Validator type:", validatorType);
                  console.log("  Validator address:", validatorAddress);
                  console.log("  Actual signature:", actualSignature);
                  
                  // Calculate the original typed data hash
                  const originalHash = hashTypedData({
                    domain,
                    types,
                    primaryType: "Mail",
                    message,
                  });
                  console.log("Original typed data hash:", originalHash);
                  
                  // Recreate the exact wrapping that eip712WrapHash does
                  // Step 1: Apply hashKernelMessageHashWrapper (for version >= 0.3.0-beta)
                  const kernelHashWrapper = keccak256(
                    encodeAbiParameters(
                      [{ type: "bytes32" }, { type: "bytes32" }],
                      [keccak256(stringToHex("Kernel(bytes32 hash)")), originalHash]
                    )
                  );
                  
                  // Step 2: Create domain separator for the kernel account
                  const kernelDomain = {
                    name: "Kernel",
                    version: "0.3.3", // KERNEL_V3_3_BETA
                    chainId: chain.id,
                    verifyingContract: account.address,
                  };
                  
                  const _domainSeparator = domainSeparator({
                    domain: kernelDomain
                  });
                  
                  // Step 3: Create the final EIP-712 digest
                  const wrappedHash = keccak256(
                    concat(["0x1901", _domainSeparator, kernelHashWrapper])
                  );
                  
                  console.log("Original typed data hash:", originalHash);
                  console.log("Kernel wrapped hash:", kernelHashWrapper);
                  console.log("Domain separator:", _domainSeparator);
                  console.log("Final wrapped hash (what kernel signs):", wrappedHash);
                  
                  // Recover the actual signer from the signature
                  try {
                    const recoveredAddress = await recoverAddress({
                      hash: wrappedHash,
                      signature: actualSignature,
                    });
                    
                    console.log("Recovered signer from kernel signature:", recoveredAddress);
                    
                    // Check if it matches any expected signer
                    const expectedSigners = [
                      embeddedWallet?.address?.toLowerCase(),
                      account.address.toLowerCase(),
                      validatorAddress.toLowerCase(),
                    ].filter(Boolean);
                    
                    if (expectedSigners.includes(recoveredAddress.toLowerCase())) {
                      console.log(`✓ Kernel signature verified! Signer: ${recoveredAddress}`);
                      isValid = true;
                    } else {
                      console.log(`⚠️ Recovered address ${recoveredAddress} doesn't match expected signers:`, expectedSigners);
                    }
                  } catch (e) {
                    console.log("Failed to recover address from signature:", e);
                  }
                  
                  if (!isValid) {
                    console.log("Could not verify kernel signature with any known signer");
                  }
                } else {
                  console.log("Kernel signature doesn't have expected 0x01 prefix");
                }
              }

              console.log("Final verification result:", isValid);
              console.log("Kernel signature:", kernelSignature);
              console.log("EOA validates:", isValid);
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
        {signError && <p className="text-sm text-red-600">{signError}</p>}
      </div>
      {!!txHash && (
        <a href={`${chain.blockExplorers.default.url}/tx/${txHash}`}>
          Success! View transaction
        </a>
      )}
    </>
  );
};
