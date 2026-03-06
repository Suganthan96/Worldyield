import { x402ResourceServer, HTTPFacilitatorClient, type RouteConfig } from '@x402/core/server'
import { registerExactEvmScheme } from '@x402/evm/exact/server'
import { X402_CONFIG } from '@/lib/x402'

const facilitatorClient = new HTTPFacilitatorClient({
  url: X402_CONFIG.facilitatorUrl,
})

export const x402Server = registerExactEvmScheme(
  new x402ResourceServer(facilitatorClient),
  {
    networks: [X402_CONFIG.network],
  },
)

export const x402AgentRouteConfig: RouteConfig = {
  accepts: {
    scheme: 'exact',
    price: X402_CONFIG.price,
    network: X402_CONFIG.network,
    payTo: X402_CONFIG.payTo,
  },
  description: 'VeraYield AI yield recommendation query',
}
