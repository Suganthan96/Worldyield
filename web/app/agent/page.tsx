"use client"

import { useState, useRef, useEffect } from "react"
import { TopNav } from "@/components/top-nav"
import { AnimatedNoise } from "@/components/animated-noise"
import { queryAiWithPayment } from "@/lib/useAiQuery"

const QUICK_QUERIES = [
  "What's the best yield option right now?",
  "Can you supply 100 USDC into Aave?",
  "Should I withdraw from the pool?",
  "Compare APY across all protocols",
]

type Message = {
  role: "user" | "assistant"
  content: string
  toolCalls?: number
  txHash?: string
  txUrl?: string
  actions?: Array<{
    type: "supply" | "withdraw"
    amount: string
    reason: string
  }>
}

const agentStats = [
  { label: "Status", value: "Active", badge: true },
  { label: "Model", value: "Llama 3.3", unit: "70B" },
  { label: "Protocols", value: "2", unit: "live" },
  { label: "Boost", value: "+1.4", unit: "% APY" },
]

const recentDecisions = [
  {
    id: "D-0342",
    action: "REBALANCE",
    reasoning: "Aave v3 APY increased by 0.41% on Optimism. Moving 12,000 USDC from Compound Arbitrum to capture higher yield.",
    time: "2h ago",
    status: "EXECUTED",
  },
  {
    id: "D-0341",
    action: "HOLD",
    reasoning: "No significant APY divergence detected. Current allocation optimal within 0.5% tolerance.",
    time: "6h ago",
    status: "CONFIRMED",
  },
  {
    id: "D-0340",
    action: "REBALANCE",
    reasoning: "Morpho Base yield spiked to 8.94%. Reallocating 8,000 USDC from Spark Ethereum.",
    time: "9h ago",
    status: "EXECUTED",
  },
]

const statusColor: Record<string, string> = {
  EXECUTED: "text-emerald-400 border-emerald-400/30",
  CONFIRMED: "text-muted-foreground border-border",
}
const actionColor: Record<string, string> = {
  REBALANCE: "text-accent",
  HOLD: "text-muted-foreground",
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello. I'm the WorldYield AI Agent. I fetch real-time APY data from chainlink data feeds within cre, Aave v3 and Compound v3 on-chain via viem, then apply the WorldYield human verification boost to give you the best effective yield. Ask me anything about your yield opportunities.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privateKey, setPrivateKey] = useState("")
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [executingAction, setExecutingAction] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || loading) return
    setInput("")
    setError(null)
    const userMessage = { role: "user" as const, content: msg }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)
    try {
      // Pass the private key from chat state to x402 payment
      const data = await queryAiWithPayment(msg, privateKey || undefined)
      
      if (data.success) {
        // Parse response for action suggestions, considering user's request
        const actions = parseActionsFromResponse(data.response, msg)
        
        setMessages((prev) => [
          ...prev, 
          { 
            role: "assistant", 
            content: data.response, 
            toolCalls: data.toolCalls,
            txHash: data.paymentInfo?.txHash,
            txUrl: data.paymentInfo?.txUrl,
            actions,
          }
        ])
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Error: Agent query failed" }])
        setError("Agent returned an error.")
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Failed to query agent"}` }])
      setError("Failed to process query. Check console for details.")
    } finally {
      setLoading(false)
    }
  }

  function parseActionsFromResponse(response: string, userQuery: string): Array<{type: "supply" | "withdraw", amount: string, reason: string}> | undefined {
    // Detect if user is requesting supply/withdraw actions with protocol mention
    const userWantsSupply = /(?:supply|deposit|add|invest).*?(?:into|to|in)\s+(?:aave|pool|the pool)/i.test(userQuery) || 
                           /(?:can you|could you|please|help me|want to|need to|should i).*supply/i.test(userQuery)
    const userWantsWithdraw = /(?:withdraw|remove|take out).*?(?:from|out of)\s+(?:aave|pool|the pool)/i.test(userQuery) ||
                             /(?:can you|could you|please|help me|want to|need to|should i).*withdraw/i.test(userQuery)
    
    const actions: Array<{type: "supply" | "withdraw", amount: string, reason: string}> = []
    
    // Enhanced pattern matching for various agent response formats
    // Matches: "supply 100 USDC", "supplying 100", "recommend supply of 100", "deposit 100 USDC", etc.
    const supplyPatterns = [
      /(?:supply|deposit|add|invest)\s+(\d+(?:\.\d+)?)\s*(?:USDC)?/i,
      /(\d+(?:\.\d+)?)\s*USDC?\s+(?:to|into|in)\s+(?:aave|pool|supply)/i,
      /recommend.*?supply.*?(\d+(?:\.\d+)?)/i,
      /suggest.*?supply.*?(\d+(?:\.\d+)?)/i,
    ]
    
    const withdrawPatterns = [
      /(?:withdraw|remove|take out|pull)\s+(\d+(?:\.\d+)?)\s*(?:USDC)?/i,
      /(\d+(?:\.\d+)?)\s*USDC?\s+(?:from|out of)\s+(?:aave|pool)/i,
      /recommend.*?withdraw.*?(\d+(?:\.\d+)?)/i,
      /suggest.*?withdraw.*?(\d+(?:\.\d+)?)/i,
    ]
    
    // Check for supply actions
    if (userWantsSupply) {
      for (const pattern of supplyPatterns) {
        const match = response.match(pattern)
        if (match) {
          actions.push({
            type: "supply",
            amount: match[1],
            reason: "Recommended by AI agent based on your request"
          })
          break
        }
      }
      
      // If user asked for supply but no amount found, suggest a default
      if (actions.length === 0) {
        // Try to extract any number from the response as potential amount
        const anyNumberMatch = response.match(/(\d+(?:\.\d+)?)/i)
        if (anyNumberMatch) {
          actions.push({
            type: "supply",
            amount: anyNumberMatch[1],
            reason: "Suggested amount based on conversation"
          })
        }
      }
    }
    
    // Check for withdraw actions
    if (userWantsWithdraw) {
      for (const pattern of withdrawPatterns) {
        const match = response.match(pattern)
        if (match) {
          actions.push({
            type: "withdraw",
            amount: match[1],
            reason: "Recommended by AI agent based on your request"
          })
          break
        }
      }
      
      // If user asked for withdraw but no amount found
      if (actions.length === 0 || !actions.some(a => a.type === "withdraw")) {
        const anyNumberMatch = response.match(/(\d+(?:\.\d+)?)/i)
        if (anyNumberMatch) {
          actions.push({
            type: "withdraw",
            amount: anyNumberMatch[1],
            reason: "Suggested amount based on conversation"
          })
        }
      }
    }
    
    return actions.length > 0 ? actions : undefined
  }

  async function executeAction(action: {type: "supply" | "withdraw", amount: string}) {
    if (!privateKey) {
      alert("Please set your private key first. Click the 'Set Private Key' button at the top.")
      setShowKeyInput(true)
      return
    }

    if (!privateKey.startsWith('0x')) {
      alert("Private key must start with '0x'")
      return
    }

    setExecutingAction(true)
    setError(null)

    try {
      const response = await fetch("/api/pool/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privateKey,
          action: action.type,
          amount: action.amount,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const explorerUrl = `https://sepolia.basescan.org/tx/${data.txHash}`
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `✓ ${data.message}\n\nTransaction Hash: ${data.txHash}\nAddress: ${data.address}`,
            txUrl: explorerUrl,
          },
        ])
      } else {
        setError(data.error || "Transaction failed")
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `✗ Transaction failed: ${data.error || "Unknown error"}\n${data.details || ''}`,
          },
        ])
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      setError(errorMsg)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✗ Failed to execute ${action.type}: ${errorMsg}`,
        },
      ])
    } finally {
      setExecutingAction(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />
      <TopNav />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-14 h-screen flex flex-col">
        {/* Header bar */}
        <div className="border-b border-border/40 px-6 md:px-12 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI Yield Optimizer</p>
            <h1 className="font-[var(--font-bebas)] text-[clamp(1.4rem,3vw,2.2rem)] tracking-[0.1em] leading-none mt-0.5">AGENT</h1>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                privateKey 
                  ? "border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10"
                  : "border-border/40 text-muted-foreground hover:border-accent hover:text-accent"
              }`}
            >
              {privateKey ? "✓ Key Set" : "Set Private Key"}
            </button>
            <div className="hidden md:flex items-center gap-6">
              {agentStats.map((s) => (
                <div key={s.label} className="text-right">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">{s.label}</p>
                  {s.badge ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {s.value}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-foreground">
                      {s.value}<span className="text-muted-foreground ml-1">{s.unit}</span>
                    </span>
                  )}
              </div>
            ))}
          </div>
        </div>
        </div>

        {/* Private Key Input Section */}
        {showKeyInput && (
          <div className="border-b border-border/40 px-6 md:px-12 py-4 bg-accent/5 shrink-0">
            <div className="max-w-2xl">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-5 w-5 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-amber-400 text-xs">⚠</span>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-amber-400/90 mb-1">Security Warning</p>
                  <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                    Your private key is used to automatically execute transactions. It will be stored in memory only and sent to the API endpoint. 
                    Only use this with test accounts on testnet. Never share your private key.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-background border border-border/40 px-4 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/60 transition-colors"
                />
                <button
                  onClick={() => {
                    if (privateKey) {
                      // Auto-add 0x prefix if missing
                      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
                      setPrivateKey(formattedKey)
                      setShowKeyInput(false)
                    } else {
                      alert("Please enter a private key")
                    }
                  }}
                  className="px-4 py-2 font-mono text-[10px] uppercase tracking-widest border border-border/40 text-foreground hover:border-accent hover:text-accent transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setPrivateKey("")
                    setShowKeyInput(false)
                  }}
                  className="px-4 py-2 font-mono text-[10px] uppercase tracking-widest border border-border/40 text-muted-foreground hover:border-red-400/40 hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0 divide-x divide-border/40">

          {/* LEFT — Chat */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6 space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-5 py-4 font-mono text-xs leading-relaxed whitespace-pre-wrap border ${
                    m.role === "user"
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-foreground border-border/40"
                  }`}>
                    {m.role === "assistant" && (
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-2">
                        Agent
                        {m.toolCalls !== undefined && m.toolCalls > 0 && (
                          <span className="ml-2 text-accent">· {m.toolCalls} tool call{m.toolCalls > 1 ? "s" : ""}</span>
                        )}
                      </p>
                    )}
                    {m.content}
                    {m.actions && m.actions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-3">Suggested Actions</p>
                        {m.actions.map((action, actionIdx) => (
                          <button
                            key={actionIdx}
                            onClick={() => executeAction(action)}
                            disabled={executingAction}
                            className={`w-full flex items-center justify-between px-3 py-2 border transition-colors disabled:opacity-40 ${
                              action.type === "supply"
                                ? "border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10"
                                : "border-purple-400/40 text-purple-400 hover:bg-purple-400/10"
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-widest">
                              {action.type === "supply" ? "↑" : "↓"} {action.type} {action.amount} USDC
                            </span>
                            <span className="text-[9px] text-muted-foreground/60">
                              {executingAction ? "Executing..." : "Click to execute"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {m.txUrl && (
                      <p className="text-[9px] text-emerald-400/90 mt-3 pt-3 border-t border-border/30">
                        {m.txUrl.includes('sepolia.basescan.org') ? (
                          <>
                            Transaction confirmed on Base Sepolia.{" "}
                            <a
                              href={m.txUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-emerald-300"
                            >
                              View on BaseScan →
                            </a>
                          </>
                        ) : (
                          <>
                            Payment verified on Base Sepolia. AI query unlocked.{" "}
                            <a
                              href={m.txUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-emerald-300"
                            >
                              View on-chain tx{m.txHash ? ` (${m.txHash.slice(0, 10)}...)` : ''}
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="border border-border/40 px-5 py-4 font-mono text-xs text-muted-foreground">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-2">Agent</p>
                    <span className="animate-pulse">Fetching on-chain data…</span>
                  </div>
                </div>
              )}
              {error && <p className="font-mono text-[10px] text-red-400/70 text-center">{error}</p>}
              <div ref={bottomRef} />
            </div>

            {/* Quick queries */}
            <div className="px-6 md:px-10 pb-3 flex flex-wrap gap-2">
              {QUICK_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={loading}
                  className="font-mono text-[10px] uppercase tracking-widest border border-border/40 px-3 py-1.5 text-muted-foreground hover:border-accent hover:text-accent transition-all duration-150 disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-6 md:px-10 pb-6 pt-1">
              <div className="flex gap-3 border border-border/60 focus-within:border-accent/60 transition-colors">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input) }
                  }}
                  disabled={loading}
                  rows={2}
                  placeholder="Ask about yield opportunities…"
                  className="flex-1 bg-transparent px-4 py-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 resize-none outline-none disabled:opacity-40"
                />
                <button
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  className="px-5 font-mono text-[10px] uppercase tracking-widest text-background bg-foreground hover:bg-accent transition-colors duration-150 disabled:opacity-30 shrink-0"
                >
                  Send
                </button>
              </div>
              <p className="mt-2 font-mono text-[9px] text-muted-foreground/40 uppercase tracking-widest">
                Enter to send · Shift+Enter for new line · x402 Payment: $0.01 USDC on Base Sepolia
              </p>
            </div>
          </div>

          {/* RIGHT — Decision log + config */}
          <div className="w-80 shrink-0 overflow-y-auto flex flex-col divide-y divide-border/30">
            <div>
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Decision Log</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="font-mono text-[9px] text-muted-foreground/60">Live</span>
                </span>
              </div>
              <div className="divide-y divide-border/20">
                {recentDecisions.map((d) => (
                  <div key={d.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground/40">{d.id}</span>
                        <span className={`font-mono text-[10px] uppercase tracking-widest ${actionColor[d.action]}`}>{d.action}</span>
                      </div>
                      <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.5 ${statusColor[d.status]}`}>{d.status}</span>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground leading-relaxed mb-1">{d.reasoning}</p>
                    <p className="font-mono text-[9px] text-muted-foreground/40">{d.time}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="px-5 py-4">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Strategy Config</span>
              </div>
              <div className="divide-y divide-border/20">
                {[
                  { k: "Model", v: "Llama 3.3 70B" },
                  { k: "Trigger", v: "APY delta > 0.3% or 8h" },
                  { k: "Max Slippage", v: "0.5%" },
                  { k: "Min Move", v: "5,000 USDC" },
                  { k: "Boost", v: "+1.4% verified humans" },
                  { k: "Consensus", v: "+0.06% per 100 humans" },
                  { k: "Protocols", v: "Aave v3, Compound v3" },
                  { k: "Network", v: "Sepolia / Base Sepolia" },
                ].map((s) => (
                  <div key={s.k} className="px-5 py-3">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 mb-0.5">{s.k}</p>
                    <p className="font-mono text-[10px] text-foreground">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="border border-border px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground text-center">
                Mastra Agent · World Chain Sepolia
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
