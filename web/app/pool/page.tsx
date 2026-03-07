"use client"

import { useState, useEffect } from "react"
import { TopNav } from "@/components/top-nav"
import { AnimatedNoise } from "@/components/animated-noise"
import { parseUnits, formatUnits } from "viem"
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi"
import { useWeb3Modal } from "@web3modal/wagmi/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { baseSepolia } from "wagmi/chains"

// Aave v3 Pool on Base Sepolia
const AAVE_POOL_ADDRESS = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as const
const USDC_ADDRESS = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" as const
const ATOKEN_ADDRESS = "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC" as const // Same as pool for aToken balance

// Simplified ABI for Aave Pool
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
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
] as const

// ERC20 ABI (approve, balanceOf, allowance)
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
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
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

export default function PoolPage() {
  const { address, isConnected, chain } = useAccount()
  const { open } = useWeb3Modal()
  const { switchChain } = useSwitchChain()
  
  const [amount, setAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [error, setError] = useState("")
  const [needsApproval, setNeedsApproval] = useState(false)
  const [isSwitchingChain, setIsSwitchingChain] = useState(false)
  const [completedTransactions, setCompletedTransactions] = useState<Array<{type: 'supply' | 'withdraw', amount: string, hash: string, timestamp: number}>>([])

  const { writeContract: approve, data: approveHash, isPending: isApproving, error: approveError } = useWriteContract()
  const { writeContract: supply, data: supplyHash, isPending: isSupplying, error: supplyError } = useWriteContract()
  const { writeContract: withdraw, data: withdrawHash, isPending: isWithdrawing, error: withdrawError } = useWriteContract()
  
  const { isLoading: isConfirmingApprove, isSuccess: isApproveConfirmed, isError: isApproveError } = useWaitForTransactionReceipt({
    hash: approveHash,
  })
  
  const { isLoading: isConfirmingSupply, isSuccess: isSupplyConfirmed, isError: isSupplyError } = useWaitForTransactionReceipt({
    hash: supplyHash,
  })

  const { isLoading: isConfirmingWithdraw, isSuccess: isWithdrawConfirmed, isError: isWithdrawError } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  })

  // Read USDC balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
  })

  // Read aToken balance (actual supplied amount)
  const { data: aTokenBalance, refetch: refetchSupplied } = useReadContract({
    address: ATOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: baseSepolia.id,
  })

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && amount ? [address, AAVE_POOL_ADDRESS] : undefined,
    chainId: baseSepolia.id,
  })

  const loading = isApproving || isConfirmingApprove || isSupplying || isConfirmingSupply || isWithdrawing || isConfirmingWithdraw || isSwitchingChain

  const balanceFormatted = balance ? formatUnits(balance as bigint, 6) : "0"
  const suppliedFormatted = aTokenBalance ? formatUnits(aTokenBalance as bigint, 6) : "0"

  useEffect(() => {
    if (isApproveConfirmed) {
      refetchAllowance()
      setNeedsApproval(false)
      setError("")
    }
  }, [isApproveConfirmed, refetchAllowance])

  useEffect(() => {
    if (isSupplyConfirmed && supplyHash && amount) {
      // Save completed transaction
      setCompletedTransactions(prev => [{
        type: 'supply',
        amount,
        hash: supplyHash,
        timestamp: Date.now()
      }, ...prev])
      setAmount("")
      setError("")
      refetchBalance()
      refetchSupplied()
      refetchAllowance()
      
      // Additional refetches to ensure balance updates
      setTimeout(() => refetchSupplied(), 2000)
      setTimeout(() => refetchSupplied(), 4000)
    }
  }, [isSupplyConfirmed, supplyHash, refetchBalance, refetchSupplied, refetchAllowance, amount])

  useEffect(() => {
    if (isWithdrawConfirmed && withdrawHash && withdrawAmount) {
      // Save completed withdrawal transaction
      setCompletedTransactions(prev => [{
        type: 'withdraw',
        amount: withdrawAmount,
        hash: withdrawHash,
        timestamp: Date.now()
      }, ...prev])
      setWithdrawAmount("")
      setError("")
      refetchBalance()
      refetchSupplied()
      
      // Additional refetches
      setTimeout(() => refetchSupplied(), 2000)
      setTimeout(() => refetchSupplied(), 4000)
    }
  }, [isWithdrawConfirmed, withdrawHash, refetchBalance, refetchSupplied, withdrawAmount])

  useEffect(() => {
    if (isApproveError || approveError) {
      console.error("Approve error:", approveError)
      setError(approveError?.message || "Approval transaction failed")
    }
  }, [isApproveError, approveError])

  useEffect(() => {
    if (isSupplyError || supplyError) {
      console.error("Supply error:", supplyError)
      setError(supplyError?.message || supplyError?.name || "Supply transaction failed")
    }
  }, [isSupplyError, supplyError])

  useEffect(() => {
    if (isWithdrawError || withdrawError) {
      console.error("Withdraw error:", withdrawError)
      setError(withdrawError?.message || withdrawError?.name || "Withdraw transaction failed")
    }
  }, [isWithdrawError, withdrawError])

  useEffect(() => {
    if (amount) {
      try {
        const amountBigInt = parseUnits(amount, 6)
        setNeedsApproval(!allowance || (allowance as bigint) < amountBigInt)
      } catch {
        setNeedsApproval(true)
      }
    } else {
      setNeedsApproval(false)
    }
  }, [allowance, amount])

  async function approveUSDC() {
    if (!amount) return
    setError("")
    setIsSwitchingChain(false)

    try {
      // Check if on correct chain
      if (chain?.id !== baseSepolia.id) {
        console.log("Wrong chain, switching to Base Sepolia...")
        setIsSwitchingChain(true)
        await switchChain({ chainId: baseSepolia.id })
        setIsSwitchingChain(false)
        // Wait a bit for the chain switch to complete
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const amountBigInt = parseUnits(amount, 6)
      console.log("Approving USDC:", {
        token: USDC_ADDRESS,
        spender: AAVE_POOL_ADDRESS,
        amount: amountBigInt.toString()
      })
      approve({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [AAVE_POOL_ADDRESS, amountBigInt],
        chainId: baseSepolia.id,
        gas: BigInt(100000), // Explicit gas limit
      })
    } catch (err: any) {
      console.error("Approval error:", err)
      setIsSwitchingChain(false)
      setError(err.message || "Approval failed")
    }
  }

  async function supplyToAave() {
    if (!address || !amount) {
      console.log("Missing address or amount", { address, amount })
      return
    }
    setError("")
    setIsSwitchingChain(false)

    try {
      // Check if on correct chain
      if (chain?.id !== baseSepolia.id) {
        console.log("Wrong chain, switching to Base Sepolia...")
        setIsSwitchingChain(true)
        await switchChain({ chainId: baseSepolia.id })
        setIsSwitchingChain(false)
        // Wait a bit for the chain switch to complete
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const amountBigInt = parseUnits(amount, 6)
      
      // Verify sufficient balance
      if (balance && (balance as bigint) < amountBigInt) {
        setError(`Insufficient USDC balance. You have ${balanceFormatted} USDC but trying to supply ${amount} USDC`)
        return
      }

      // Verify sufficient allowance
      await refetchAllowance()
      if (!allowance || (allowance as bigint) < amountBigInt) {
        setError(`Insufficient allowance. Please approve USDC first. Current allowance: ${allowance ? formatUnits(allowance as bigint, 6) : '0'} USDC`)
        setNeedsApproval(true)
        return
      }

      console.log("Supplying to Aave:", {
        pool: AAVE_POOL_ADDRESS,
        asset: USDC_ADDRESS,
        amount: amountBigInt.toString(),
        onBehalfOf: address,
        referralCode: 0,
        balance: balance?.toString(),
        allowance: allowance?.toString()
      })
      
      supply({
        address: AAVE_POOL_ADDRESS,
        abi: AAVE_POOL_ABI,
        functionName: "supply",
        args: [USDC_ADDRESS, amountBigInt, address, 0],
        chainId: baseSepolia.id,
        gas: BigInt(500000), // Explicit gas limit to avoid estimation issues
      })
    } catch (err: any) {
      console.error("Supply error:", err)
      setIsSwitchingChain(false)
      setError(err.message || err.shortMessage || "Supply failed")
    }
  }

  async function withdrawFromAave() {
    if (!address || !withdrawAmount) {
      console.log("Missing address or withdraw amount", { address, withdrawAmount })
      return
    }
    setError("")
    setIsSwitchingChain(false)

    try {
      // Check if on correct chain
      if (chain?.id !== baseSepolia.id) {
        console.log("Wrong chain, switching to Base Sepolia...")
        setIsSwitchingChain(true)
        await switchChain({ chainId: baseSepolia.id })
        setIsSwitchingChain(false)
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const amountBigInt = parseUnits(withdrawAmount, 6)
      
      // Verify sufficient aToken balance
      if (aTokenBalance && (aTokenBalance as bigint) < amountBigInt) {
        setError(`Insufficient supplied balance. You have ${suppliedFormatted} USDC supplied but trying to withdraw ${withdrawAmount} USDC`)
        return
      }

      console.log("Withdrawing from Aave:", {
        pool: AAVE_POOL_ADDRESS,
        asset: USDC_ADDRESS,
        amount: amountBigInt.toString(),
        to: address,
        aTokenBalance: aTokenBalance?.toString()
      })
      
      withdraw({
        address: AAVE_POOL_ADDRESS,
        abi: AAVE_POOL_ABI,
        functionName: "withdraw",
        args: [USDC_ADDRESS, amountBigInt, address],
        chainId: baseSepolia.id,
        gas: BigInt(500000),
      })
    } catch (err: any) {
      console.error("Withdraw error:", err)
      setIsSwitchingChain(false)
      setError(err.message || err.shortMessage || "Withdraw failed")
    }
  }

  const currentTxHash = approveHash || supplyHash || withdrawHash

  return (
    <main className="relative min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />
      <TopNav />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-14 min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl border-border/40 bg-background/80 backdrop-blur">
          <CardHeader className="border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Supply Liquidity
                </p>
                <CardTitle className="font-[var(--font-bebas)] text-[clamp(1.8rem,4vw,2.8rem)] tracking-[0.1em] leading-none mt-1">
                  AAVE POOL
                </CardTitle>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                  Network
                </p>
                <p className="font-mono text-xs text-foreground">Base Sepolia</p>
              </div>
            </div>
            <CardDescription className="font-mono text-xs mt-4">
              Supply USDC to Aave v3 on Base Sepolia and earn yield. Your supplied assets are used as
              collateral and you'll receive aTokens in return.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Wallet Connection */}
            {!isConnected ? (
              <div className="text-center py-8">
                <Button
                  onClick={() => open()}
                  className="font-mono text-xs uppercase tracking-widest"
                  size="lg"
                >
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <>
                {/* Wallet Info */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-border/40 p-4">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-1">
                      Your Address
                    </p>
                    <p className="font-mono text-xs text-foreground truncate">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </p>
                  </div>
                  <div className="border border-border/40 p-4">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 mb-1">
                      USDC Balance
                    </p>
                    <p className="font-mono text-xs text-foreground">
                      {parseFloat(balanceFormatted).toFixed(2)} USDC
                    </p>
                  </div>
                  <div className="border border-emerald-400/40 bg-emerald-400/5 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
                        Total Supplied
                      </p>
                      <button 
                        onClick={() => refetchSupplied()}
                        className="font-mono text-[8px] text-emerald-400/60 hover:text-emerald-400 transition-colors"
                        title="Refresh balance"
                      >
                        ↻ REFRESH
                      </button>
                    </div>
                    <p className="font-mono text-sm font-semibold text-emerald-400">
                      {parseFloat(suppliedFormatted).toFixed(2)} USDC
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground/60 mt-0.5">
                      = {parseFloat(suppliedFormatted).toFixed(2)} aUSDC
                    </p>
                  </div>
                </div>

                {/* Wrong Chain Warning */}
                {chain && chain.id !== baseSepolia.id && (
                  <Alert className="border-red-400/40 bg-red-400/10">
                    <AlertDescription className="font-mono text-xs text-red-400">
                      ⚠️ Wrong network! Please switch to Base Sepolia. Click any button below to auto-switch.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Supply Form */}
                <div className="space-y-4">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
                      Amount to Supply (USDC)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="font-mono bg-background border-border/60"
                        disabled={loading}
                      />
                      <Button
                        variant="outline"
                        onClick={() => setAmount(balanceFormatted)}
                        className="font-mono text-xs uppercase tracking-widest"
                        disabled={loading}
                      >
                        Max
                      </Button>
                    </div>
                  </div>

                  {needsApproval && (
                    <Alert className="border-amber-400/40 bg-amber-400/10">
                      <AlertDescription className="font-mono text-xs">
                        ⚠️ You need to approve USDC spending first. The ETH fee shown in MetaMask is just for gas - you're approving USDC tokens, not spending ETH.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!needsApproval && amount && parseFloat(amount) > 0 && (
                    <Alert className="border-blue-400/40 bg-blue-400/10">
                      <AlertDescription className="font-mono text-xs text-blue-400">
                        💡 You will supply {amount} USDC to Aave. The ETH fee is only for gas (network fees).
                      </AlertDescription>
                    </Alert>
                  )}

                  {isSwitchingChain && (
                    <Alert className="border-amber-400/40 bg-amber-400/10">
                      <AlertDescription className="font-mono text-xs">
                        🔄 Switching to Base Sepolia network...
                      </AlertDescription>
                    </Alert>
                  )}

                  {error && (
                    <Alert className="border-red-400/40 bg-red-400/10">
                      <AlertDescription className="font-mono text-xs text-red-400">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  {currentTxHash && !isSupplyConfirmed && !isApproveConfirmed && !isWithdrawConfirmed && (
                    <Alert className="border-blue-400/40 bg-blue-400/10">
                      <AlertDescription className="font-mono text-xs text-blue-400">
                        ⏳ Transaction submitted! Waiting for confirmation...{" "}
                        <a
                          href={`https://sepolia.basescan.org/tx/${currentTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          View on BaseScan
                        </a>
                      </AlertDescription>
                    </Alert>
                  )}

                  {isSupplyConfirmed && supplyHash && (
                    <Alert className="border-emerald-400/40 bg-emerald-400/10">
                      <AlertDescription className="font-mono text-xs text-emerald-400">
                        ✓ Supply confirmed! Your balance will update shortly.
                      </AlertDescription>
                    </Alert>
                  )}

                  {isWithdrawConfirmed && withdrawHash && (
                    <Alert className="border-emerald-400/40 bg-emerald-400/10">
                      <AlertDescription className="font-mono text-xs text-emerald-400">
                        ✓ Withdrawal confirmed! Your balance will update shortly.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Transaction History - Always Visible */}
                  {completedTransactions.length > 0 && (
                    <div className="border border-emerald-400/40 bg-emerald-400/5 rounded-lg p-4 space-y-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/80">
                        Recent Transactions
                      </p>
                      {completedTransactions.slice(0, 3).map((tx, idx) => (
                        <div key={tx.hash} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={tx.type === 'supply' ? "text-emerald-400 text-base" : "text-blue-400 text-base"}>
                              {tx.type === 'supply' ? '✓' : '↓'}
                            </span>
                            <span className={`font-mono text-xs font-semibold ${tx.type === 'supply' ? 'text-emerald-400' : 'text-blue-400'}`}>
                              {tx.type === 'supply' ? `Successfully supplied ${tx.amount} USDC` : `Successfully withdrew ${tx.amount} USDC`}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground/80 ml-6">
                            Transaction:{" "}
                            <a
                              href={`https://sepolia.basescan.org/tx/${tx.hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className={`underline ${tx.type === 'supply' ? 'text-emerald-400/80 hover:text-emerald-400' : 'text-blue-400/80 hover:text-blue-400'}`}
                            >
                              {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                            </a>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground/60 ml-6">
                            {tx.type === 'supply' ? 'You received aUSDC tokens earning yield automatically' : 'USDC returned to your wallet'}
                          </div>
                          {idx < completedTransactions.slice(0, 3).length - 1 && (
                            <div className="border-t border-emerald-400/20 mt-2 pt-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isApproveConfirmed && approveHash && !isSupplyConfirmed && (
                    <Alert className="border-emerald-400/40 bg-emerald-400/10">
                      <AlertDescription className="font-mono text-xs text-emerald-400">
                        ✓ Approval successful!{" "}
                        <a
                          href={`https://sepolia.basescan.org/tx/${approveHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          View on BaseScan
                        </a>
                        <div className="mt-1 opacity-80">Now you can click "Supply" to deposit your USDC.</div>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-3">
                    {needsApproval ? (
                      <Button
                        onClick={approveUSDC}
                        disabled={loading || !amount || parseFloat(amount) <= 0}
                        className="flex-1 font-mono text-xs uppercase tracking-widest"
                      >
                        {isSwitchingChain ? "Switching Chain..." : loading ? "Approving..." : `Approve ${amount || "0"} USDC`}
                      </Button>
                    ) : (
                      <Button
                        onClick={supplyToAave}
                        disabled={loading || !amount || parseFloat(amount) <= 0}
                        className="flex-1 font-mono text-xs uppercase tracking-widest"
                      >
                        {isSwitchingChain ? "Switching Chain..." : loading ? "Supplying..." : `Supply ${amount || "0"} USDC`}
                      </Button>
                    )}
                  </div>

                  {/* Withdraw Section */}
                  <div className="border-t border-border/40 pt-6 space-y-4">
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
                        Amount to Withdraw (USDC)
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0.00"
                          className="font-mono bg-background border-border/60"
                          disabled={loading}
                        />
                        <Button
                          variant="outline"
                          onClick={() => setWithdrawAmount(suppliedFormatted)}
                          className="font-mono text-xs uppercase tracking-widest"
                          disabled={loading}
                        >
                          Max
                        </Button>
                      </div>
                    </div>

                    {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                      <Alert className="border-purple-400/40 bg-purple-400/10">
                        <AlertDescription className="font-mono text-xs text-purple-400">
                          💡 You will withdraw {withdrawAmount} USDC from Aave. Your aUSDC will be burned.
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      onClick={withdrawFromAave}
                      disabled={loading || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(suppliedFormatted) <= 0}
                      variant="outline"
                      className="w-full font-mono text-xs uppercase tracking-widest border-purple-400/40 hover:bg-purple-400/10"
                    >
                      {isSwitchingChain ? "Switching Chain..." : loading ? "Withdrawing..." : `Withdraw ${withdrawAmount || "0"} USDC`}
                    </Button>
                  </div>
                </div>

                {/* Info */}
                <div className="border-t border-border/40 pt-6 space-y-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    Protocol Information
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 font-mono text-xs">
                    <div>
                      <p className="text-muted-foreground/60">Pool Address</p>
                      <p className="text-foreground truncate">{AAVE_POOL_ADDRESS.slice(0, 10)}...</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">USDC Address</p>
                      <p className="text-foreground truncate">{USDC_ADDRESS.slice(0, 10)}...</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">aToken Address</p>
                      <p className="text-foreground truncate">{ATOKEN_ADDRESS.slice(0, 10)}...</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">Current APY</p>
                      <p className="text-emerald-400">~3.12%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">Human Boost</p>
                      <p className="text-accent">+1.4%</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}