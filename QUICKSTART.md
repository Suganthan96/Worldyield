# ⚡ Quick Setup Guide

Get VeraYield running in 5 minutes!

## 🎯 Prerequisites

1. **Node.js 18+** installed
2. **Wallet with testnet tokens**
3. **Private key** ready

---

## 📝 Step 1: Environment Setup

Create `.env` in project root:

```env
PRIVATE_KEY=0x1234567890abcdef...
NEXT_PUBLIC_WLD_APP_ID=app_staging_...
NEXT_PUBLIC_WLD_ACTION=verayield-entry
```

---

## 💰 Step 2: Get Testnet Tokens

### Option A: Base Sepolia (Easiest)
**All-in-one faucet:**
https://www.coinbase.com/faucets/base-sepolia-faucet

Gives you: ETH + USDC + WETH ✅

### Option B: Ethereum Sepolia
**ETH:** https://sepoliafaucet.com  
**USDC:** https://staging.aave.com/faucet/

---

## 🚀 Step 3: Choose Your Path

### Path A: Quick Deposit (2 min) ⭐ **Recommended**

Deposit USDC to Aave so CRE can detect your balance:

```bash
# 1. Install dependencies
cd scripts
npm install

# 2. Deposit to Aave V3
npm run deposit 10
```

**What happens:**
- ✅ Checks your USDC balance
- ✅ Deposits 10 USDC to Aave V3
- ✅ Receives aUSDC (proof of deposit)
- ✅ CRE can now see your balance!

**Why this matters:**
```
Before: "Balance in pool: 0 ❌"
After:  "Balance in pool: 10 USDC ✅"
```

---

### Path B: Full Demo (5 min)

Test the complete VeraYield CRE workflow:

```bash
# 1. Install dependencies
cd scripts
npm install

# 2. Run end-to-end demo
npm run demo
```

**What happens:**
- ✅ Checks your balances
- ✅ Deposits 10 USDC to Aave v3
- ✅ Runs CRE workflow
- ✅ Shows yield recommendations

---

### Path C: Try the AI Agent (3 min)

Chat with the AI about yields:

```bash
# 1. Start agent server
cd agent
npm install
npm run dev

# 2. Open test page
# http://localhost:3001/test
```

**Try asking:**
- "What's the best yield option right now?"
- "Compare APY across all protocols"
- "How much boost do verified humans get?"

---

## 🎨 Step 4: Try the Frontend

Launch the full World App interface:

```bash
cd frontend
npm install
npm run dev

# Open http://localhost:3000
```

**Features:**
- World ID verification
- MiniKit commands (Pay, Sign, etc.)
- Vault deposits
- Yield tracking

---

## 🔍 Verify Everything Works

### Check 1: Balances
```bash
cd scripts
npx ts-node -e "
import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
wallet.getBalance().then(b => console.log('ETH:', ethers.formatEther(b)));
"
```

### Check 2: Agent Running
Open: http://localhost:3001/test  
Should see: VeraYield AI Agent interface ✅

### Check 3: CRE Workflow
```bash
cd cre/my-workflow
npm run simulate
```
Should see: "Exit Code: 0" ✅

---

## 🐛 Troubleshooting

### "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Insufficient balance"
Get more tokens from faucets above ☝️

### "PRIVATE_KEY not found"
Check your `.env` file exists in project root

### Agent won't start
```bash
cd agent
rm -rf node_modules
npm install
npm run dev
```

### CRE fails
Ensure you're using correct addresses in config:
```bash
cd cre/my-workflow
cat config.json
```

---

## 📊 Expected Results

### Deposit Script Output:
```
🏦 Aave V3 Deposit Script (Ethereum Sepolia)
════════════════════════════════════════════════════════════

📍 Wallet: 0x1234...
💰 ETH Balance: 0.5
💵 USDC Balance: 100.0

✅ Approving USDC for Aave Pool...
   ✅ Approved!

💰 Depositing 10 USDC into Aave V3...
   TX: 0xabcd...
   ✅ Confirmed in block 12345

════════════════════════════════════════════════════════════
✅ Deposit Successful!

📊 Summary:
   Deposited: 10 USDC
   Received: +10.0 aUSDC
   Total aUSDC: 10.0

🤖 Next Steps:
   1. Run CRE workflow: cd ../cre/my-workflow && npm run simulate
   2. Your workflow will now detect balance and can rebalance!
```

### Demo Script Output:
```
✅ Step 1: Check Balances
✅ Step 2: Deposit to Aave
✅ Step 3: Run CRE Workflow
✅ Step 4: Show Rebalance Recommendations

📊 Success Rate: 4/4 steps completed

🎉 Demo completed successfully!

💡 What just happened:
   ✅ Deposited USDC into Aave V3 on Ethereum Sepolia
   ✅ CRE workflow fetched real APY from blockchain
   ✅ Compared Aave V3 vs Compound V3 yields
   ✅ Calculated optimal rebalancing strategy
```

### AI Agent Response:
```
Based on current blockchain data:

Aave v3 (Ethereum Sepolia): 57.59% APY
Compound v3 (Base Sepolia): 12.34% APY

Recommendation: Deposit to Aave v3 for +45.25% higher yield.

With World ID verification, you'll get an additional +1.4% boost!
```

---

## 🎯 Next Steps

1. **Verify with World ID** → Get +1.4% APY boost
2. **Monitor CRE** → Runs every 5 minutes
3. **Try deposits** → Test with small amounts first
4. **Join community** → Share feedback!

---

## 💡 Pro Tips

- Start with **Base Sepolia** (easiest faucet)
- Test with **5-10 USDC** first
- Keep **0.01 ETH** for gas
- Run **demo script** before frontend
- Use **AI agent** for recommendations

---

## 🆘 Still Stuck?

Check these in order:
1. `.env` file exists in project root ✅
2. PRIVATE_KEY is set correctly ✅
3. Wallet has testnet tokens ✅
4. Node.js 18+ installed ✅
5. All dependencies installed (`npm install`) ✅

---

## 📚 Full Documentation

- **Main README**: [../Readme.md](../Readme.md)
- **Scripts Guide**: [scripts/README.md](scripts/README.md)
- **Agent Docs**: [agent/README.md](agent/README.md)
- **CRE Guide**: [cre/README.md](cre/README.md)

---

## ✅ Success Checklist

- [ ] `.env` file created with PRIVATE_KEY
- [ ] Testnet tokens acquired (ETH + USDC)
- [ ] Scripts installed (`cd scripts && npm install`)
- [ ] Demo script runs successfully
- [ ] AI agent accessible at localhost:3001/test
- [ ] CRE workflow completes (Exit Code: 0)
- [ ] Frontend loads at localhost:3000

**All checked?** You're ready to use VeraYield! 🎉

---

Made with ❤️ by the VeraYield team
