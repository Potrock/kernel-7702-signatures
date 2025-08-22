"use client";

import { zeroAddress, Address, hashTypedData, keccak256, encodeAbiParameters, concat, recoverAddress, domainSeparator, stringToHex, encodeFunctionData } from "viem";
import { useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { useZeroDevKernel } from "./useZeroDevKernel";
import { InstallValidator } from "./InstallValidator";

export const Zerodev = () => {
  const { wallets } = useWallets();
  const { account, kernelClient, initializing, error, chain, publicClient } =
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
            
            try {
              console.log("=== Debugging UserOp vs Signature Validation ===");
              console.log("Account address:", account.address);
              
              // First, let's see what happens when we send a UserOp
              console.log("\n1. Testing UserOp (this works)...");
              try {
                const userOpHash = await kernelClient.sendUserOperation({
                  calls: [{
                    to: zeroAddress,
                    value: BigInt(0),
                    data: "0x" as `0x${string}`,
                  }],
                });
                console.log("✅ UserOp sent successfully:", userOpHash);
                console.log("This proves validation is working for UserOps");
                
                const receipt = await kernelClient.waitForUserOperationReceipt({
                  hash: userOpHash,
                });
                console.log("Transaction:", receipt.receipt.transactionHash);
              } catch (e) {
                console.error("UserOp failed:", e);
              }
              
              // Now let's try to properly install the validator
              console.log("\n2. Installing the validator as a module...");
              
              const validatorAddress = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";
              
              // Install the validator using installValidations
              // Create ValidationId (type 0x01 for VALIDATOR + address)
              const validationId = ("0x01" + validatorAddress.slice(2)) as `0x${string}`;
              
              console.log("ValidationId to install:", validationId);
              console.log("Validator address:", validatorAddress);
              
              // Get current nonce to use for the config
              let currentNonce = 1;
              try {
                const nonceResult = await publicClient.readContract({
                  address: account.address,
                  abi: [{
                    inputs: [],
                    name: "currentNonce",
                    outputs: [{ name: "", type: "uint32" }],
                    stateMutability: "view",
                    type: "function"
                  }],
                  functionName: "currentNonce",
                });
                currentNonce = Number(nonceResult) || 1;
                console.log("Current nonce:", currentNonce);
              } catch (e) {
                console.log("Could not read nonce, using 1");
              }
              
              // The ECDSA validator expects the owner address as the first 20 bytes of validationData
              const ownerAddress = embeddedWallet?.address || account.address;
              console.log("Owner address for validator:", ownerAddress);
              
              // Create the validation data with the owner address (20 bytes)
              // Remove the 0x prefix from the address and pad if needed
              const validatorData = ownerAddress as `0x${string}`;
              
              const installValidationsCall = encodeFunctionData({
                abi: [{
                  name: "installValidations",
                  type: "function",
                  inputs: [
                    { name: "vIds", type: "bytes21[]" },
                    { name: "configs", type: "tuple[]", components: [
                      { name: "nonce", type: "uint32" },
                      { name: "hook", type: "address" }
                    ]},
                    { name: "validationData", type: "bytes[]" },
                    { name: "hookData", type: "bytes[]" }
                  ],
                  outputs: [],
                  stateMutability: "payable",
                }],
                functionName: "installValidations",
                args: [
                  [validationId], // Array with one ValidationId
                  [{
                    nonce: currentNonce,
                    hook: "0x0000000000000000000000000000000000000001" as Address // HOOK_MODULE_INSTALLED
                  }], // Array with one ValidationConfig
                  [validatorData], // Pass the owner address as validator data
                  ["0x" as `0x${string}`]  // Empty hook data (hook doesn't need data)
                ]
              });
              
              console.log("Attempting to install validator using installValidations...");
              
              // Log the full transaction details for debugging
              console.log("\n=== TRANSACTION DETAILS FOR SIMULATION ===");
              console.log("To:", account.address);
              console.log("From:", embeddedWallet?.address || "unknown");
              console.log("Value:", "0");
              console.log("Calldata:", installValidationsCall);
              console.log("\n// Copy this for simulation:");
              console.log(JSON.stringify({
                to: account.address,
                from: embeddedWallet?.address || account.address,
                value: "0x0",
                data: installValidationsCall
              }, null, 2));
              console.log("===========================================\n");
              
              try {
                const installHash = await kernelClient.sendUserOperation({
                  calls: [{
                    to: account.address,
                    value: BigInt(0),
                    data: installValidationsCall,
                  }],
                });
                
                console.log("Install UserOp sent:", installHash);
                const installReceipt = await kernelClient.waitForUserOperationReceipt({
                  hash: installHash,
                });
                console.log("✅ Validator module installed!", installReceipt.receipt.transactionHash);
                
                // After installation, test signature
                console.log("\n3. Testing signature after module installation...");
                const testSig = await kernelClient.signMessage({
                  account,
                  message: "test after install",
                });
                
                console.log("New signature:", testSig.slice(0, 50) + "...");
                
                // Try isValidSignature
                const testHash = keccak256(new TextEncoder().encode("test after install"));
                const result = await publicClient.readContract({
                  address: account.address,
                  abi: [{
                    inputs: [
                      { name: "hash", type: "bytes32" },
                      { name: "signature", type: "bytes" }
                    ],
                    name: "isValidSignature",
                    outputs: [{ name: "", type: "bytes4" }],
                    stateMutability: "view",
                    type: "function"
                  }],
                  functionName: "isValidSignature",
                  args: [testHash, testSig],
                });
                
                const EIP1271_MAGIC_VALUE = "0x1626ba7e";
                if (result === EIP1271_MAGIC_VALUE) {
                  console.log("✅✅✅ SUCCESS! Signature validates after module installation!");
                } else {
                  console.log("❌ Still not validating. Result:", result);
                }
                
              } catch (installError) {
                console.error("Failed to install module:", installError);
                console.log("The module might already be installed or there's a permission issue");
              }
              
              // Check current rootValidator
              try {
                const currentRoot = await publicClient.readContract({
                  address: account.address,
                  abi: [{
                    inputs: [],
                    name: "rootValidator",
                    outputs: [{ name: "", type: "bytes21" }],
                    stateMutability: "view",
                    type: "function"
                  }],
                  functionName: "rootValidator",
                });
                
                console.log("Current rootValidator:", currentRoot);
                
                // Check if rootValidator is uninitialized (either 0x00... or 0xdeadbeef...)
                const isUninitialized = currentRoot === "0x000000000000000000000000000000000000000000" ||
                                       currentRoot.toLowerCase().startsWith("0xdeadbeef");
                
                if (isUninitialized) {
                  console.log("❌ Root validator is not properly set!");
                  console.log("Current value:", currentRoot);
                  if (currentRoot.toLowerCase().startsWith("0xdeadbeef")) {
                    console.log("This is the default placeholder value from the constructor");
                  }
                  
                  // Check if account has code (might be already initialized but with bad state)
                  const accountCode = await publicClient.getCode({
                    address: account.address
                  });
                  
                  if (accountCode && accountCode !== '0x') {
                    console.log("Account has code but rootValidator is 0x00...");
                    console.log("This might be an EIP-7702 account or improperly initialized");
                    console.log("Will try changeRootValidator instead of initialize");
                    
                    // Use changeRootValidator instead
                    const validationId = ("0x01" + validatorAddress.slice(2)) as `0x${string}`;
                    
                    const changeRootValidatorCall = encodeFunctionData({
                      abi: [{
                        name: "changeRootValidator",
                        type: "function",
                        inputs: [
                          { name: "_rootValidator", type: "bytes21" },
                          { name: "hook", type: "address" },
                          { name: "validatorData", type: "bytes" },
                          { name: "hookData", type: "bytes" }
                        ],
                        outputs: [],
                        stateMutability: "payable",
                      }],
                      functionName: "changeRootValidator",
                      args: [
                        validationId as `0x${string}`,
                        "0x0000000000000000000000000000000000000001" as Address, // HOOK_MODULE_INSTALLED
                        "0x" as `0x${string}`, // empty validator data
                        "0x" as `0x${string}`, // empty hook data
                      ]
                    });
                    
                    console.log("Attempting changeRootValidator...");
                    console.log("Call data:", changeRootValidatorCall);
                    
                    try {
                      const userOpHash = await kernelClient.sendUserOperation({
                        calls: [{
                          to: account.address,
                          value: BigInt(0),
                          data: changeRootValidatorCall,
                        }],
                      });
                      
                      console.log("UserOp hash:", userOpHash);
                      console.log("Waiting for receipt...");
                      
                      const receipt = await kernelClient.waitForUserOperationReceipt({
                        hash: userOpHash,
                      });
                      
                      console.log("Transaction successful:", receipt.receipt.transactionHash);
                      console.log("✅ Root validator should now be set!");
                    } catch (changeError) {
                      console.error("Failed to changeRootValidator:", changeError);
                      console.log("The account might need to be initialized first");
                      console.log("Or the validator might not be compatible");
                    }
                    
                  } else {
                    // No code, try regular initialize
                    console.log("No code deployed, trying initialize...");
                    
                    const validationId = ("0x01" + validatorAddress.slice(2)) as `0x${string}`;
                    
                    const initializeCall = encodeFunctionData({
                      abi: [{
                        name: "initialize",
                        type: "function",
                        inputs: [
                          { name: "_rootValidator", type: "bytes21" },
                          { name: "hook", type: "address" },
                          { name: "validatorData", type: "bytes" },
                          { name: "hookData", type: "bytes" },
                          { name: "initConfig", type: "bytes[]" }
                        ],
                        outputs: [],
                        stateMutability: "nonpayable",
                      }],
                      functionName: "initialize",
                      args: [
                        validationId as `0x${string}`,
                        "0x0000000000000000000000000000000000000001" as Address,
                        "0x" as `0x${string}`,
                        "0x" as `0x${string}`,
                        []
                      ]
                    });
                    
                    const userOpHash = await kernelClient.sendUserOperation({
                      calls: [{
                        to: account.address,
                        value: BigInt(0),
                        data: initializeCall,
                      }],
                    });
                    
                    console.log("UserOp hash:", userOpHash);
                    const receipt = await kernelClient.waitForUserOperationReceipt({
                      hash: userOpHash,
                    });
                    
                    console.log("Transaction successful:", receipt.receipt.transactionHash);
                    console.log("✅ Account initialized with root validator!");
                  }
                  
                } else {
                  console.log("Root validator is already set to:", currentRoot);
                  
                  // If it's not the validator we expect, we might need to change it
                  const currentValidatorAddress = "0x" + currentRoot.slice(4, 44);
                  if (currentValidatorAddress.toLowerCase() !== validatorAddress.toLowerCase()) {
                    console.log("Current validator address:", currentValidatorAddress);
                    console.log("Expected validator address:", validatorAddress);
                    console.log("Consider using changeRootValidator to update it");
                  }
                }
                
              } catch (error) {
                console.error("Error:", error);
              }
                
                // After initialization, try the signature again
                setTimeout(async () => {
                  console.log("\nRetrying signature validation after initialization...");
                  
                  const testDomain = {
                    name: "Test",
                    version: "1",
                    chainId: chain.id,
                    verifyingContract: zeroAddress,
                  } as const;
                  
                  const testTypes = {
                    Message: [{ name: "content", type: "string" }],
                  } as const;
                  
                  const testMessage = { content: "Test after init" };
                  
                  const testSig = await kernelClient.signTypedData({
                    account,
                    domain: testDomain,
                    types: testTypes,
                    primaryType: "Message",
                    message: testMessage,
                  });
                  
                  console.log("New signature after init:", testSig);
                  
                  // Check if validator is in the new signature
                  if (testSig.startsWith('0x01')) {
                    const newValidator = '0x' + testSig.slice(4, 44);
                    console.log("Validator in new signature:", newValidator);
                  }
                  
                  // Now test isValidSignature
                  console.log("\n=== Testing isValidSignature after initialization ===");
                  
                  try {
                    const originalHash = hashTypedData({
                      domain: testDomain,
                      types: testTypes,
                      primaryType: "Message",
                      message: testMessage,
                    });
                    
                    console.log("Calling isValidSignature...");
                    const result = await publicClient.readContract({
                      address: account.address,
                      abi: [
                        {
                          inputs: [
                            { name: "hash", type: "bytes32" },
                            { name: "signature", type: "bytes" }
                          ],
                          name: "isValidSignature",
                          outputs: [{ name: "", type: "bytes4" }],
                          stateMutability: "view",
                          type: "function"
                        }
                      ],
                      functionName: "isValidSignature",
                      args: [originalHash, testSig],
                    });
                    
                    const EIP1271_MAGIC_VALUE = "0x1626ba7e";
                    const isValid = result === EIP1271_MAGIC_VALUE;
                    
                    console.log("isValidSignature result:", result);
                    console.log("Expected magic value:", EIP1271_MAGIC_VALUE);
                    
                    if (isValid) {
                      console.log("✅ SUCCESS! Signature validates correctly via EIP-1271!");
                      console.log("The kernel account is now properly initialized and can validate signatures.");
                    } else {
                      console.log("❌ Signature still not validating");
                    }
                  } catch (error: any) {
                    console.error("Error calling isValidSignature:", error);
                    if (error?.message?.includes('InvalidValidator')) {
                      console.log("Still getting InvalidValidator - may need different initialization");
                    }
                  }
                }, 2000);
                
            } catch (error) {
              console.error("Error:", error);
            }
          }}
          disabled={!kernelClient || !account || initializing}
          className="text-sm bg-orange-600 hover:bg-orange-700 py-2 px-4 rounded-md text-white border-none"
        >
          Initialize Account Validators
        </button>

        <button
          onClick={async () => {
            if (!publicClient || !account || !kernelClient) return;
            
            try {
              console.log("=== Comprehensive Validator State Analysis ===");
              console.log("Account address:", account.address);
              
              // Check if account has code
              const code = await publicClient.getCode({
                address: account.address
              });
              
              if (!code || code === '0x') {
                console.log("Account has no code deployed");
                return;
              }
              
              console.log("Account has code, length:", code.length);
              
              // Check if it's EIP-7702 delegated code
              const isEIP7702 = code.startsWith('0xef0100');
              console.log("Is EIP-7702 delegation:", isEIP7702);
              
              console.log("\n1. Reading ALL validator-related state...");
              try {
                // Read the rootValidator (ValidationId is bytes21)
                const rootValidatorId = await publicClient.readContract({
                  address: account.address,
                  abi: [
                    {
                      inputs: [],
                      name: "rootValidator",
                      outputs: [{ name: "", type: "bytes21" }],
                      stateMutability: "view",
                      type: "function"
                    }
                  ],
                  functionName: "rootValidator",
                });
                
                console.log("Root validator ID (bytes21):", rootValidatorId);
                
                // ValidationId structure (21 bytes):
                // - First byte: validation type (0x00=ROOT, 0x01=VALIDATOR, 0x02=PERMISSION)
                // - Next 20 bytes: validator address or permission ID
                const validationType = rootValidatorId.slice(0, 4); // "0x00" or "0x01" etc
                const validatorAddress = "0x" + rootValidatorId.slice(4, 44); // 20 bytes
                
                console.log("Validation type:", validationType);
                console.log("Validator address from rootValidator:", validatorAddress);
                
                // Map validation types
                const typeNames: Record<string, string> = {
                  "0x00": "VALIDATION_TYPE_ROOT",
                  "0x01": "VALIDATION_TYPE_VALIDATOR", 
                  "0x02": "VALIDATION_TYPE_PERMISSION",
                  "0x03": "VALIDATION_TYPE_7702"
                };
                console.log("Type name:", typeNames[validationType] || "UNKNOWN");
                
              } catch (e) {
                console.log("Error reading rootValidator:", e);
              }
              
              // Try to read currentNonce
              try {
                const currentNonce = await publicClient.readContract({
                  address: account.address,
                  abi: [{
                    inputs: [],
                    name: "currentNonce",
                    outputs: [{ name: "", type: "uint32" }],
                    stateMutability: "view",
                    type: "function"
                  }],
                  functionName: "currentNonce",
                });
                console.log("Current nonce:", currentNonce);
              } catch (e) {
                console.log("Error reading currentNonce:", e);
              }
              
              // Try to read validNonceFrom
              try {
                const validNonceFrom = await publicClient.readContract({
                  address: account.address,
                  abi: [{
                    inputs: [],
                    name: "validNonceFrom",
                    outputs: [{ name: "", type: "uint32" }],
                    stateMutability: "view",
                    type: "function"
                  }],
                  functionName: "validNonceFrom",
                });
                console.log("Valid nonce from:", validNonceFrom);
              } catch (e) {
                console.log("Error reading validNonceFrom:", e);
              }
              
              console.log("\n2. Checking validator in signatures...");
              // Create a test signature to see what validator is being used
              const testSig = await kernelClient.signMessage({
                account,
                message: "test",
              });
              
              if (testSig.startsWith('0x00') || testSig.startsWith('0x01')) {
                const sigValidatorType = testSig.slice(0, 4);
                const sigValidatorAddress = '0x' + testSig.slice(4, 44);
                console.log("Signature validator type:", sigValidatorType);
                console.log("Signature validator address:", sigValidatorAddress);
                
                // Key insight: if signature has type 0x00 (ROOT), it will use rootValidator
                // if signature has type 0x01 (SECONDARY), it needs to be installed
                if (sigValidatorType === '0x00') {
                  console.log("✓ Using ROOT validator - should work with rootValidator");
                } else if (sigValidatorType === '0x01') {
                  console.log("❌ Using SECONDARY validator - needs proper installation");
                  console.log("This validator's hook is likely HOOK_MODULE_NOT_INSTALLED");
                }
              }
              
              console.log("\n3. Testing isValidSignature with different approaches...");
              
              // Try with a ROOT type signature (0x00 prefix)
              const testHash = keccak256(new TextEncoder().encode("test"));
              
              // Create a signature with 0x00 (ROOT) prefix to force using rootValidator
              const rootPrefixSig = "0x00" + testSig.slice(4); // Replace 0x01 with 0x00
              
              console.log("Original signature:", testSig.slice(0, 50) + "...");
              console.log("ROOT-prefixed signature:", rootPrefixSig.slice(0, 50) + "...");
              
              try {
                const result = await publicClient.readContract({
                  address: account.address,
                  abi: [
                    {
                      inputs: [
                        { name: "hash", type: "bytes32" },
                        { name: "signature", type: "bytes" }
                      ],
                      name: "isValidSignature",
                      outputs: [{ name: "", type: "bytes4" }],
                      stateMutability: "view",
                      type: "function"
                    }
                  ],
                  functionName: "isValidSignature",
                  args: [testHash, rootPrefixSig as `0x${string}`],
                });
                
                const EIP1271_MAGIC_VALUE = "0x1626ba7e";
                console.log("Result with ROOT prefix:", result);
                console.log("Is valid:", result === EIP1271_MAGIC_VALUE);
              } catch (error: any) {
                console.log("Error with ROOT prefix:", error?.message?.slice(0, 100));
              }
              
            } catch (error) {
              console.error("Error checking validators:", error);
            }
          }}
          disabled={!publicClient || !account || !kernelClient}
          className="text-sm bg-purple-600 hover:bg-purple-700 py-2 px-4 rounded-md text-white border-none"
        >
          Deep Validator Analysis
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
                
                // Method 1: Try to recover signer from the wrapped hash (for debugging)
                try {
                  const recoveredAddress = await recoverAddress({
                    hash: wrappedHash,
                    signature: actualSig,
                  });
                  
                  console.log("Recovered address from wrapped hash:", recoveredAddress);
                  console.log("Embedded wallet:", embeddedWallet?.address);
                } catch (e) {
                  console.log("Failed to recover address:", e);
                }
                
                // Method 2: Call isValidSignature on the kernel account (the proper way!)
                console.log("\n=== Testing isValidSignature on kernel account ===");
                
                // First check if the account has code
                const accountCode = await publicClient.getCode({
                  address: account.address
                });
                
                if (!accountCode || accountCode === '0x') {
                  console.log("⚠️ Account doesn't have code deployed yet");
                  console.log("The account needs to be deployed first (e.g., by sending a transaction)");
                  console.log("For now, the signature is valid for an EOA but can't be validated via isValidSignature");
                  return;
                }
                
                console.log("Account has code deployed ✓");
                
                try {
                  // Call isValidSignature with the ORIGINAL hash (not wrapped)
                  // The kernel will do the wrapping internally
                  const result = await publicClient.readContract({
                    address: account.address,
                    abi: [
                      {
                        inputs: [
                          { name: "hash", type: "bytes32" },
                          { name: "signature", type: "bytes" }
                        ],
                        name: "isValidSignature",
                        outputs: [{ name: "", type: "bytes4" }],
                        stateMutability: "view",
                        type: "function"
                      }
                    ],
                    functionName: "isValidSignature",
                    args: [originalHash, kernelSig],
                  });
                  
                  const EIP1271_MAGIC_VALUE = "0x1626ba7e";
                  const isValid = result === EIP1271_MAGIC_VALUE;
                  
                  console.log("isValidSignature result:", result);
                  console.log("Expected magic value:", EIP1271_MAGIC_VALUE);
                  console.log("✅ Signature is valid:", isValid);
                  
                  if (isValid) {
                    console.log("SUCCESS! The kernel signature validates via EIP-1271!");
                    console.log("This is how external contracts like Permit2 will validate it.");
                  } else {
                    console.log("❌ Signature validation failed");
                  }
                } catch (error: any) {
                  console.error("Error calling isValidSignature:", error);
                  
                  // Check if it's an InvalidValidator error
                  if (error?.message?.includes('0x682a6e7c') || error?.message?.includes('InvalidValidator')) {
                    console.log("\n❌ InvalidValidator error!");
                    console.log("This means the kernel account doesn't recognize the validator in the signature");
                    
                    // Parse the signature to show what validator it's trying to use
                    if (kernelSig.startsWith('0x01')) {
                      const validatorAddress = '0x' + kernelSig.slice(4, 44);
                      console.log("Validator address in signature:", validatorAddress);
                      console.log("This validator might not be installed on the kernel account");
                      console.log("\nPossible solutions:");
                      console.log("1. The account needs to have this validator installed");
                      console.log("2. The account might need to be initialized with a transaction first");
                      console.log("3. For EIP-7702, the delegation might need to be set");
                    }
                  } else {
                    console.log("Unknown error - the account might not be properly initialized");
                  }
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
                
                // The proper way: Call isValidSignature on the kernel account
                try {
                  // Calculate the original typed data hash
                  const originalHash = hashTypedData({
                    domain,
                    types,
                    primaryType: "Mail",
                    message,
                  });
                  
                  console.log("Calling isValidSignature on kernel account...");
                  console.log("Account address:", account.address);
                  console.log("Original hash:", originalHash);
                  console.log("Signature:", kernelSignature);
                  
                  // Call isValidSignature with the ORIGINAL hash
                  // The kernel contract will handle all the wrapping internally
                  const result = await publicClient.readContract({
                    address: account.address,
                    abi: [
                      {
                        inputs: [
                          { name: "hash", type: "bytes32" },
                          { name: "signature", type: "bytes" }
                        ],
                        name: "isValidSignature",
                        outputs: [{ name: "", type: "bytes4" }],
                        stateMutability: "view",
                        type: "function"
                      }
                    ],
                    functionName: "isValidSignature",
                    args: [originalHash, kernelSignature],
                  });
                  
                  const EIP1271_MAGIC_VALUE = "0x1626ba7e";
                  isValid = result === EIP1271_MAGIC_VALUE;
                  
                  console.log("isValidSignature result:", result);
                  console.log("Expected magic value:", EIP1271_MAGIC_VALUE);
                  
                  if (isValid) {
                    console.log("✅ Signature validated via EIP-1271!");
                  } else {
                    console.log("❌ Signature validation failed");
                  }
                } catch (error) {
                  console.error("Error calling isValidSignature:", error);
                  console.log("Note: This might fail if the account doesn't have code deployed yet");
                  console.log("In that case, the direct EOA signature method above should work");
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
        
        <InstallValidator 
          kernelData={{ account, kernelClient, initializing, error, chain, publicClient }}
          embeddedWalletAddress={embeddedWallet?.address as Address | undefined}
        />
      </div>
      {!!txHash && (
        <a href={`${chain.blockExplorers.default.url}/tx/${txHash}`}>
          Success! View transaction
        </a>
      )}
    </>
  );
};
