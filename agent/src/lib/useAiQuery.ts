import { x402Client } from '@x402/core/client'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch'
import { toClientEvmSigner } from '@x402/evm'
import { privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { X402_CONFIG } from '@/lib/x402'

interface AiQueryResult {
  success: boolean
  response: string
  toolCalls: number
  paymentInfo: {
    charged: string
    network: string
    paidTo: string
    txHash?: string
    txUrl?: string
  }
}

function getExplorerTxUrl(network: string, txHash: string): string {
  if (network === 'eip155:84532') {
    return `https://sepolia.basescan.org/tx/${txHash}`
  }

  if (network === 'eip155:8453') {
    return `https://basescan.org/tx/${txHash}`
  }

  return txHash
}

/**
 * Payment client for x402 using user-provided private key.
 * @param message - The message to send to the AI agent
 * @param userPrivateKey - Optional private key from user. If not provided, falls back to env variable.
 */
export async function queryAiWithPayment(message: string, userPrivateKey?: string): Promise<AiQueryResult> {
  // Use user-provided key if available, otherwise fallback to env
  const key = (userPrivateKey || process.env.NEXT_PUBLIC_WALLET_PRIVATE_KEY) as `0x${string}` | undefined

  if (!key || key === '0x') {
    throw new Error('Private key required for x402 payment signing. Please set your private key in the chat interface.')
  }

  const account = privateKeyToAccount(key)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  })

  const client = registerExactEvmScheme(new x402Client(), {
    signer: toClientEvmSigner(account, publicClient),
    networks: [X402_CONFIG.network],
  })

  const payingFetch = wrapFetchWithPayment(fetch, client)

  const res = await payingFetch('/api/test-agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })

  const data = await res.json()
  const paymentResponseHeader = res.headers.get('PAYMENT-RESPONSE')

  if (paymentResponseHeader && data?.paymentInfo) {
    try {
      const settle = decodePaymentResponseHeader(paymentResponseHeader)
      if (settle?.transaction) {
        data.paymentInfo.txHash = settle.transaction
        data.paymentInfo.txUrl = getExplorerTxUrl(settle.network, settle.transaction)
      }
    } catch {
      // Non-fatal: response body is still usable even if header decoding fails.
    }
  }

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed with status ${res.status}`)
  }

  return data as AiQueryResult
}
