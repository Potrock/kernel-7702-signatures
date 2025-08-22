"use client";

import { useState } from "react";
import { Address, encodeFunctionData, keccak256 } from "viem";
import { UseZeroDevKernelResult } from "./useZeroDevKernel";

interface InstallValidatorProps {
  kernelData: UseZeroDevKernelResult;
  embeddedWalletAddress?: Address;
}

export function InstallValidator({ kernelData, embeddedWalletAddress }: InstallValidatorProps) {
  const { account, kernelClient, publicClient } = kernelData;
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string>("");

  const checkValidatorInstalled = async (validatorAddress: string): Promise<boolean> => {
    if (!account || !publicClient) return false;
    
    try {
      // Create ValidationId for the validator we're checking
      const validationId = ("0x01" + validatorAddress.slice(2)) as `0x${string}`;
      
      // Try to read the validationConfig for this ValidationId
      const config = await publicClient.readContract({
        address: account.address,
        abi: [{
          inputs: [{ name: "vId", type: "bytes21" }],
          name: "validationConfig",
          outputs: [
            {
              components: [
                { name: "nonce", type: "uint32" },
                { name: "hook", type: "address" }
              ],
              type: "tuple"
            }
          ],
          stateMutability: "view",
          type: "function"
        }],
        functionName: "validationConfig",
        args: [validationId],
      });
      
      // Check if hook is HOOK_MODULE_INSTALLED (address(1))
      const HOOK_MODULE_INSTALLED = "0x0000000000000000000000000000000000000001";
      return config.hook === HOOK_MODULE_INSTALLED;
    } catch (e) {
      console.log("Error checking validator:", e);
      return false;
    }
  };

  const installValidator = async () => {
    if (!account || !kernelClient || !publicClient) {
      setStatus("Missing account or client");
      return;
    }

    setInstalling(true);
    setStatus("Starting validator installation...");

    try {
      // The validator address from our signatures
      const validatorAddress = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";
      
      // Check if already installed
      setStatus("Checking if validator is already installed...");
      const isInstalled = await checkValidatorInstalled(validatorAddress);
      
      if (isInstalled) {
        setStatus("✅ Validator is already installed!");
        
        // Test signature validation
        setStatus("Testing signature validation...");
        const testMessage = "Test validation";
        const testSig = await kernelClient.signMessage({
          account,
          message: testMessage,
        });
        
        const testHash = keccak256(new TextEncoder().encode(testMessage));
        
        try {
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
            setStatus("✅ Validator is installed and signatures validate!");
          } else {
            setStatus("⚠️ Validator installed but signatures not validating");
          }
        } catch (e: any) {
          setStatus(`⚠️ Validator installed but isValidSignature failed: ${e.message}`);
        }
        
        return;
      }
      
      setStatus("Validator not installed. Proceeding with installation...");
      
      // Get the owner address
      const ownerAddress = embeddedWalletAddress || account.address;
      setStatus(`Using owner address: ${ownerAddress}`);
      
      // Validate owner address
      if (!ownerAddress || !ownerAddress.startsWith('0x') || ownerAddress.length !== 42) {
        throw new Error(`Invalid owner address format: ${ownerAddress}`);
      }
      
      // Get current nonce
      setStatus("Reading current nonce...");
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
      
      setStatus(`Current nonce: ${currentNonce}`);
      
      // Create ValidationId
      const validationId = ("0x01" + validatorAddress.slice(2)) as `0x${string}`;
      
      // Create installValidations call
      setStatus("Encoding installValidations transaction...");
      const installValidationsCall = encodeFunctionData({
        abi: [{
          inputs: [
            { name: "_validators", type: "bytes21[]" },
            { name: "_configs", type: "tuple[]", components: [
              { name: "nonce", type: "uint32" },
              { name: "hook", type: "address" }
            ]},
            { name: "_validatorData", type: "bytes[]" },
            { name: "_hookData", type: "bytes[]" }
          ],
          name: "installValidations",
          outputs: [],
          stateMutability: "payable",
          type: "function"
        }],
        functionName: "installValidations",
        args: [
          [validationId],
          [{
            nonce: currentNonce,
            hook: "0x0000000000000000000000000000000000000001" as Address
          }],
          [ownerAddress as `0x${string}`], // Pass owner address as validator data
          ["0x" as `0x${string}`]
        ]
      });
      
      setStatus("Sending UserOp to install validator...");
      
      // Log transaction details for debugging
      console.log("Installation transaction details:");
      console.log({
        to: account.address,
        from: ownerAddress,
        calldata: installValidationsCall,
        validationId,
        validatorData: ownerAddress,
      });
      
      const userOpHash = await kernelClient.sendUserOperation({
        callData: installValidationsCall,
      });
      
      setStatus(`UserOp sent: ${userOpHash.slice(0, 10)}...`);
      
      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      
      setStatus(`✅ Validator installed! Tx: ${receipt.receipt.transactionHash.slice(0, 10)}...`);
      
      // Wait for state update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test signature after installation
      setStatus("Testing signature validation...");
      const testMessage = "Post-install test";
      const testSig = await kernelClient.signMessage({
        account,
        message: testMessage,
      });
      
      const testHash = keccak256(new TextEncoder().encode(testMessage));
      
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
        setStatus("🎉 SUCCESS! Validator installed and signatures validate!");
      } else {
        setStatus("⚠️ Validator installed but signatures not validating correctly");
      }
      
    } catch (error: any) {
      console.error("Installation error:", error);
      
      // Parse error for more details
      if (error?.message?.includes('paymaster')) {
        setStatus("❌ Paymaster simulation failed - validator's onInstall might be reverting");
      } else if (error?.message?.includes('InvalidValidator')) {
        setStatus("❌ InvalidValidator error - validator format issue");
      } else if (error?.message?.includes('revert')) {
        const revertMatch = error.message.match(/revert: (0x[a-fA-F0-9]+)/);
        if (revertMatch) {
          setStatus(`❌ Reverted with: ${revertMatch[1]}`);
        } else {
          setStatus(`❌ Transaction reverted: ${error.message.slice(0, 100)}`);
        }
      } else {
        setStatus(`❌ Error: ${error.message?.slice(0, 100) || 'Unknown error'}`);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={installValidator}
        disabled={!kernelClient || !account || installing}
        className="text-sm bg-purple-600 hover:bg-purple-700 py-2 px-4 rounded-md text-white border-none disabled:opacity-50"
      >
        {installing ? "Installing..." : "Smart Install Validator"}
      </button>
      {status && (
        <div className="text-xs p-2 bg-gray-100 rounded-md">
          {status}
        </div>
      )}
    </div>
  );
}