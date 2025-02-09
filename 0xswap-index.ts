import { config as dotenv } from "dotenv";
import {
  createWalletClient,
  http,
  getContract,
  erc20Abi,
  parseUnits,
  maxUint256,
  publicActions,
  concat,
  numberToHex,
  size,
} from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scroll } from "viem/chains";
import { wethAbi } from "./abi/weth-abi";
 
/* For the 0x Challenge on Scroll, implement the following
 
1. Display the percentage breakdown of liquidity sources
2. Monetize your app with affiliate fees and surplus collection
3. Display buy/sell tax for tokens with tax
4. Display all sources of liquidity on Scroll
 
*/
 
const qs = require("qs");
 
// Load environment variables
dotenv();
const { PRIVATE_KEY, ZERO_EX_API_KEY, ALCHEMY_HTTP_TRANSPORT_URL } =
  process.env;
 
// Validate requirements
if (!PRIVATE_KEY) throw new Error("missing PRIVATE_KEY.");
if (!ZERO_EX_API_KEY) throw new Error("missing ZERO_EX_API_KEY.");
if (!ALCHEMY_HTTP_TRANSPORT_URL)
  throw new Error("missing ALCHEMY_HTTP_TRANSPORT_URL.");
 
// Fetch headers
const headers = new Headers({
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
});
 
// Setup wallet client
const client = createWalletClient({
  account: privateKeyToAccount(`0x${PRIVATE_KEY}` as `0x${string}`),
  chain: scroll,
  transport: http(ALCHEMY_HTTP_TRANSPORT_URL),
}).extend(publicActions); // Extend wallet client with publicActions for public client
 
const [address] = await client.getAddresses();
 
// Set up contracts
const weth = getContract({
  address: "0x5300000000000000000000000000000000000004",
  abi: wethAbi,
  client,
});
const wsteth = getContract({
  address: "0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32",
  abi: erc20Abi,
  client,
});
 
// Function to display the percentage breakdown of liquidity sources
function displayLiquiditySources(route: any) {
  const fills = route.fills;
  const totalBps = fills.reduce((acc: number, fill: any) => acc + parseInt(fill.proportionBps), 0);
 
  console.log(`${fills.length} Sources`);
  fills.forEach((fill: any) => {
    const percentage = (parseInt(fill.proportionBps) / 100).toFixed(2);
    console.log(`${fill.source}: ${percentage}%`);
  });
}
 
// Function to display the buy/sell taxes for tokens
function displayTokenTaxes(tokenMetadata: any) {
  const buyTokenBuyTax = (parseInt(tokenMetadata.buyToken.buyTaxBps) / 100).toFixed(2);
  const buyTokenSellTax = (parseInt(tokenMetadata.buyToken.sellTaxBps) / 100).toFixed(2);
  const sellTokenBuyTax = (parseInt(tokenMetadata.sellToken.buyTaxBps) / 100).toFixed(2);
  const sellTokenSellTax = (parseInt(tokenMetadata.sellToken.sellTaxBps) / 100).toFixed(2);
 
  if (buyTokenBuyTax > 0 || buyTokenSellTax > 0) {
    console.log(`Buy Token Buy Tax: ${buyTokenBuyTax}%`);
    console.log(`Buy Token Sell Tax: ${buyTokenSellTax}%`);
  }
 
  if (sellTokenBuyTax > 0 || sellTokenSellTax > 0) {
    console.log(`Sell Token Buy Tax: ${sellTokenBuyTax}%`);
    console.log(`Sell Token Sell Tax: ${sellTokenSellTax}%`);
  }
}
 
// Function to display all liquidity sources on Scroll
const getLiquiditySources = async () => {
  const chainId = client.chain.id.toString(); // Ensure this is the correct ID for Scroll
  const sourcesParams = new URLSearchParams({
    chainId: chainId,
  });
 
  const sourcesResponse = await fetch(
    `https://api.0x.org/swap/v1/sources?${sourcesParams.toString()}`,
    {
      headers,
    }
  );
 
  const sourcesData = await sourcesResponse.json();
  const sources = Object.keys(sourcesData.sources);
  console.log("Liquidity sources for Scroll chain:");
  console.log(sources.join(", "));
};
 
const main = async () => {
  // 4. Display all liquidity sources on Scroll
  await getLiquiditySources();
 
  // Specify sell amount
  const decimals = (await weth.read.decimals()) as number;
  const sellAmount = parseUnits("0.1", decimals);
 
  // 2. Add parameters for affiliate fees and surplus collection
  const affiliateFeeBps = "100"; // 1%
  const surplusCollection = "true";
 
  // 1. Fetch price with monetization parameters
  const priceParams = new URLSearchParams({
    chainId: client.chain.id.toString(),
    sellToken: weth.address,
    buyToken: wsteth.address,
    sellAmount: sellAmount.toString(),
    taker: client.account.address,
    affiliateFee: affiliateFeeBps, // Parameter for affiliate fees
    surplusCollection: surplusCollection, // Parameter for surplus collection
  });
 
  const priceResponse = await fetch(
    "https://api.0x.org/swap/permit2/price?" + priceParams.toString(),
    {
      headers,
    }
  );
 
  const price = await priceResponse.json();
  console.log("Fetching price to swap 0.1 WETH for wstETH");
  console.log(
    `https://api.0x.org/swap/permit2/price?${priceParams.toString()}`
  );
  console.log("priceResponse: ", price);
 
  // 2. Check if taker needs to set an allowance for Permit2
  if (price.issues.allowance !== null) {
    try {
      const { request } = await weth.simulate.approve([
        price.issues.allowance.spender,
        maxUint256,
      ]);
      console.log("Approving Permit2 to spend WETH...", request);
      // Set approval
      const hash = await weth.write.approve(request.args);
      console.log(
        "Approved Permit2 to spend WETH.",
        await client.waitForTransactionReceipt({ hash })
      );
    } catch (error) {
      console.log("Error approving Permit2:", error);
    }
  } else {
    console.log("WETH already approved for Permit2");
  }
 
  // 3. Fetch quote with monetization parameters
  const quoteParams = new URLSearchParams();
  for (const [key, value] of priceParams.entries()) {
    quoteParams.append(key, value);
  }
 
  const quoteResponse = await fetch(
    "https://api.0x.org/swap/permit2/quote?" + quoteParams.toString(),
    {
      headers,
    }
  );
 
  const quote = await quoteResponse.json();
  console.log("Fetching quote to swap 0.1 WETH for wstETH");
  console.log("quoteResponse: ", quote);
 
  // 1. Display the percentage breakdown of liquidity sources
  if (quote.route) {
    displayLiquiditySources(quote.route);
  }
 
  // 3. Display the buy/sell taxes for tokens
  if (quote.tokenMetadata) {
    displayTokenTaxes(quote.tokenMetadata);
  }
 
  // 2. Display monetization information
  if (quote.affiliateFeeBps) {
    const affiliateFee = (parseInt(quote.affiliateFeeBps) / 100).toFixed(2);
    console.log(`Affiliate Fee: ${affiliateFee}%`);
  }
 
  if (quote.tradeSurplus && parseFloat(quote.tradeSurplus) > 0) {
    console.log(`Trade Surplus Collected: ${quote.tradeSurplus}`);
  }
 
  // 4. Sign permit2.eip712 returned from quote
  let signature: Hex | undefined;
  if (quote.permit2?.eip712) {
    try {
      signature = await client.signTypedData(quote.permit2.eip712);
      console.log("Signed permit2 message from quote response");
    } catch (error) {
      console.error("Error signing permit2 coupon:", error);
    }
 
    // 5. Append sig length and sig data to transaction.data
    if (signature && quote?.transaction?.data) {
      const signatureLengthInHex = numberToHex(size(signature), {
        signed: false,
        size: 32,
      });
 
      const transactionData = quote.transaction.data as Hex;
      const sigLengthHex = signatureLengthInHex as Hex;
      const sig = signature as Hex;
 
      quote.transaction.data = concat([transactionData, sigLengthHex, sig]);
    } else {
      throw new Error("Failed to obtain signature or transaction data");
    }
  }
 
  // 6. Submit transaction with permit2 signature
  if (signature && quote.transaction.data) {
    const nonce = await client.getTransactionCount({
      address: client.account.address,
    });
 
    const signedTransaction = await client.signTransaction({
      account: client.account,
      chain: client.chain,
      gas: quote?.transaction.gas ? BigInt(quote.transaction.gas) : undefined,
      to: quote?.transaction.to,
      data: quote.transaction.data,
      value: quote?.transaction.value
        ? BigInt(quote.transaction.value)
        : undefined, // value is used for native tokens
      gasPrice: quote?.transaction.gasPrice
        ? BigInt(quote.transaction.gasPrice)
        : undefined,
      nonce: nonce,
    });
    const hash = await client.sendRawTransaction({
      serializedTransaction: signedTransaction,
    });
 
    console.log("Transaction hash:", hash);
 
    console.log(`See tx details at https://scrollscan.com/tx/${hash}`);
  } else {
    console.error("Failed to obtain a signature, transaction not sent.");
  }
};
 
main();
