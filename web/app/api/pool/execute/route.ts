import { NextRequest, NextResponse } from "next/server"
import { createWalletClient, http, parseUnits, publicActions } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"

// Aave v3 Pool on Base Sepolia
const AAVE_POOL_ADDRESS = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as const
const USDC_ADDRESS = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" as const

// Aave Pool ABI
const AAVE_POOL_ABI = [
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

// ERC20 ABI
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { privateKey: userPrivateKey, action, amount } = body
    
    // Use user-provided key, or fallback to server-side bot wallet
    const privateKey = userPrivateKey || process.env.SERVER_SIDE_PRIVATE_KEY

    if (!privateKey || !action || !amount) {
      return NextResponse.json(
        { error: "Missing required parameters. No private key available (set SERVER_SIDE_PRIVATE_KEY in .env or provide in request)" },
        { status: 400 }
      )
    }

    if (action !== "supply" && action !== "withdraw") {
      return NextResponse.json(
        { error: "Invalid action. Must be 'supply' or 'withdraw'" },
        { status: 400 }
      )
    }

    // Create account from private key
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    
    // Create wallet client
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    }).extend(publicActions)

    const amountBigInt = parseUnits(amount, 6)

    if (action === "supply") {
      // Step 1: Check and approve USDC if needed
      const allowance = await walletClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account.address, AAVE_POOL_ADDRESS],
      })

      if (allowance < amountBigInt) {
        console.log("Approving USDC...")
        const approveHash = await walletClient.writeContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [AAVE_POOL_ADDRESS, amountBigInt],
          gas: BigInt(100000),
        })

        // Wait for approval confirmation
        await walletClient.waitForTransactionReceipt({ hash: approveHash })
        console.log("USDC approved:", approveHash)
      }

      // Step 2: Supply to Aave
      console.log("Supplying to Aave...")
      const supplyHash = await walletClient.writeContract({
        address: AAVE_POOL_ADDRESS,
        abi: AAVE_POOL_ABI,
        functionName: "supply",
        args: [USDC_ADDRESS, amountBigInt, account.address, 0],
        gas: BigInt(500000),
      })

      // Wait for supply confirmation
      await walletClient.waitForTransactionReceipt({ hash: supplyHash })

      return NextResponse.json({
        success: true,
        action: "supply",
        amount,
        txHash: supplyHash,
        address: account.address,
        message: `Successfully supplied ${amount} USDC to Aave`,
      })
    } else {
      // Withdraw from Aave
      console.log("Withdrawing from Aave...")
      const withdrawHash = await walletClient.writeContract({
        address: AAVE_POOL_ADDRESS,
        abi: AAVE_POOL_ABI,
        functionName: "withdraw",
        args: [USDC_ADDRESS, amountBigInt, account.address],
        gas: BigInt(500000),
      })

      // Wait for withdrawal confirmation
      await walletClient.waitForTransactionReceipt({ hash: withdrawHash })

      return NextResponse.json({
        success: true,
        action: "withdraw",
        amount,
        txHash: withdrawHash,
        address: account.address,
        message: `Successfully withdrew ${amount} USDC from Aave`,
      })
    }
  } catch (error: any) {
    console.error("Pool execute error:", error)
    return NextResponse.json(
      { 
        error: error.message || "Transaction failed",
        details: error.toString()
      },
      { status: 500 }
    )
  }
}
