"use client"

import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const steps = [
  {
    index: "01",
    title: "Entry + Identity",
    layer: "MiniKit · World ID · World Chain",
    description:
      "User opens WorldYield in World App → MiniKit triggers Semaphore ZK proof → verified onchain on World Chain. Non-verified wallet fees fund a gas subsidy pool — verified humans transact gas-free.",
    tags: ["ZK Proof", "Nullifier", "Gas Subsidy"],
    color: "border-accent/40",
  },
  {
    index: "02",
    title: "AI Query via x402",
    layer: "Gemini · Mastra · CRE · HumanConsensus.sol",
    description:
      "x402 micropayment fires from World wallet → Gemini agent pulls live APY via CRE and onchain human participant counts. Returns ranked list: \"Aave Arbitrum — 18.4% → 19.8% verified — 847 humans in pool\".",
    tags: ["x402", "CRE Workflow", "Human Signal"],
    color: "border-emerald-500/30",
  },
  {
    index: "03",
    title: "CRE Cross-Chain Data",
    layer: "CRE Workflow · CCIP · World Chain",
    description:
      "Workflow fires simultaneously: Aave/Arbitrum, Compound/Base, Morpho/Ethereum. CCIP reads live APY + TVL + verified human participant count per pool. Results aggregated on World Chain — rendered in UI in real time.",
    tags: ["Parallel Fetch", "CCIP Read", "Onchain Aggregation"],
    color: "border-blue-500/30",
  },
  {
    index: "04",
    title: "Human-Only Yield Boost",
    layer: "WorldIDGate.sol · VeraYieldVault.sol",
    description:
      "World ID ZK proof submitted at deposit → protocol verifies credential → unlocks boosted APY tier (19.8% vs 18.4% base). Proof logged onchain. Bots hitting same pool receive base rate only — non-replayable by design.",
    tags: ["Boosted APY", "Credential Proof", "Bot Exclusion"],
    color: "border-yellow-500/30",
  },
  {
    index: "05",
    title: "Execute — One Tap",
    layer: "MiniKit · CCIP · Aave · VeraYieldVault",
    description:
      "MiniKit fires atomic sequence: USDC approved → CCIP bridge to Arbitrum → Aave deposit with human credential → aToken returned to World wallet. Full tx hash chain logged onchain and visible in UI.",
    tags: ["Atomic Tx", "CCIP Bridge", "aToken Receipt"],
    color: "border-purple-500/30",
  },
  {
    index: "06",
    title: "Auto-Rebalance — Set and Forget",
    layer: "MandateStorage.sol · CRE Cron · CCIP · Mastra",
    description:
      "User sets mandate: \"Keep above 15% APY\". CRE cron checks all pools every 24h. If current pool drops below threshold — agent identifies next best human-boosted pool, auto-withdraws via CCIP, re-deposits, sends World App notification. Every rebalance logged with timestamp + AI reasoning.",
    tags: ["Onchain Mandate", "24h Cron", "Auto-Withdraw"],
    color: "border-orange-500/30",
  },
  {
    index: "07",
    title: "Collective Human Signal",
    layer: "HumanConsensus.sol · CRE · Gemini Agent",
    description:
      "Every deposit/withdrawal by a verified user increments a per-pool onchain counter. CRE aggregates into a Human Consensus Score. AI flags pools with 0 verified humans + high APY as suspicious. Dashboard: \"Top pool: Aave Arbitrum — 1,203 humans\". ZK-verified. Unbotfakeable.",
    tags: ["Consensus Score", "Trust Signal", "Sybil-Proof"],
    color: "border-red-500/30",
  },
]

export function FlowSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      const cards = stepsRef.current?.querySelectorAll("article")
      if (cards) {
        gsap.from(cards, {
          y: 50,
          opacity: 0,
          duration: 0.7,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: stepsRef.current,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="flow"
      className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-20 flex items-end justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            03 / Execution Flow
          </span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
            UNSTOPPABLE ONCHAIN
          </h2>
        </div>
        <p className="hidden md:block max-w-xs font-mono text-xs text-muted-foreground text-right leading-relaxed">
          Seven steps. ZK-proofed entry, AI-ranked yield, CCIP execution, onchain mandates. No human action needed after setup.
        </p>
      </div>

      {/* Steps */}
      <div ref={stepsRef} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px border border-border/20">
        {steps.map((step) => (
          <article
            key={step.index}
            className={cn(
              "relative p-8 border-l-2 bg-background/60 hover:bg-muted/10 transition-colors duration-300",
              step.color,
            )}
          >
            {/* Step number */}
            <div className="flex items-start justify-between mb-5">
              <span className="font-mono text-[10px] text-muted-foreground/40 tracking-widest">
                STEP {step.index}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/30 text-right max-w-[140px] leading-relaxed">
                {step.layer}
              </span>
            </div>

            {/* Title */}
            <h3 className="font-[var(--font-bebas)] text-2xl md:text-3xl tracking-wide mb-4">
              {step.title}
            </h3>

            {/* Description */}
            <p className="font-mono text-xs text-muted-foreground leading-relaxed mb-6">
              {step.description}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {step.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[9px] uppercase tracking-widest border border-border/30 px-2 py-1 text-muted-foreground/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}

        {/* Final stat panel */}
        <article className="relative p-8 border-l-2 border-foreground/10 bg-accent/5 flex flex-col justify-between">
          <div>
            <span className="font-mono text-[10px] text-muted-foreground/40 tracking-widest">HUMAN CONSENSUS</span>
            <div className="mt-6 space-y-4">
              {[
                { pool: "Aave Arbitrum", humans: "1,203", apy: "19.8%" },
                { pool: "Compound Base", humans: "847", apy: "14.2%" },
                { pool: "Morpho Ethereum", humans: "612", apy: "17.2%" },
              ].map((row) => (
                <div key={row.pool} className="flex items-center justify-between border-b border-border/20 pb-3">
                  <div>
                    <p className="font-mono text-xs text-foreground/80">{row.pool}</p>
                    <p className="font-mono text-[10px] text-muted-foreground/40">{row.humans} verified humans</p>
                  </div>
                  <span className="font-mono text-sm text-emerald-400">{row.apy}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="font-mono text-[9px] text-muted-foreground/30 uppercase tracking-widest mt-6">
            ZK-verified · Non-replayable · Bots excluded
          </p>
        </article>
      </div>
    </section>
  )
}
