import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const apiKey = process.env.API_KEY_0X;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing API_KEY_0X in environment" },
      { status: 500 }
    );
  }

  const wallet = request.nextUrl.searchParams.get("wallet");

  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  // Base Sepolia chain ID
  const CHAIN_ID = 8453;
  const USDC_DECIMALS = 6;

  const amountInUSD = 1;
  const formattedAmount = (amountInUSD * 10 ** USDC_DECIMALS).toString();

  const quoteResponse = await fetch(
    `https://api.0x.org/swap/permit2/quote?chainId=${CHAIN_ID}&sellToken=${USDC_ADDRESS}&buyToken=${ETH_ADDRESS}&sellAmount=${formattedAmount}&taker=${wallet}`,
    {
      headers: {
        '0x-api-key': process.env.API_KEY_0X,
        '0x-version': 'v2'
      }
    }
  );

  const quote = await quoteResponse.json();

  console.log(JSON.stringify(quote, null, 2));

  return NextResponse.json(quote);
}