'use client';

import { useState } from 'react';
import { queryAiWithPayment } from '@/lib/useAiQuery';

export default function TestPage() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [txUrl, setTxUrl] = useState('');
  const [txHash, setTxHash] = useState('');

  const testAgent = async () => {
    setLoading(true);
    setResponse('');
    setPaid(false);
    setTxUrl('');
    setTxHash('');
    
    try {
      const data = await queryAiWithPayment(message);
      
      if (data.success) {
        setResponse(data.response || JSON.stringify(data, null, 2));
        setPaid(true);
        if (data.paymentInfo?.txUrl) {
          setTxUrl(data.paymentInfo.txUrl);
        }
        if (data.paymentInfo?.txHash) {
          setTxHash(data.paymentInfo.txHash);
        }
      } else {
        setResponse('Error: Query failed');
      }
    } catch (error) {
      setResponse(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const quickQueries = [
    "What's the best yield option right now?",
    "Compare APY across all protocols",
    "How does human verification boost work?",
    "Should I move my funds from Aave to Compound?",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">VeraYield AI Agent</h1>
          <p className="text-gray-600 mt-2">Test the intelligent yield optimization advisor</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Ask about yield opportunities:
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 h-32 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's the best yield option for verified humans right now?"
            />
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-2">Quick queries:</p>
            <div className="flex flex-wrap gap-2">
              {quickQueries.map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => setMessage(query)}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full transition-colors"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={testAgent}
            disabled={loading || !message}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors"
          >
            {loading ? 'Processing x402 payment + analyzing...' : 'Get Yield Recommendation (x402 Payment enabled)'}
          </button>

          {paid && (
            <div className="text-sm text-green-700">
              <p>Payment verified on Base Sepolia. AI query unlocked.</p>
              {txUrl && (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  View on-chain tx{txHash ? ` (${txHash.slice(0, 10)}...)` : ''}
                </a>
              )}
            </div>
          )}

          {response && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-3 text-gray-900">Agent Response:</h2>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
                <pre className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {response}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            <strong>Note:</strong> Each query is gated by x402 and charges $0.01 USDC on Base Sepolia before calling the agent.
          </p>
        </div>
      </div>
    </div>
  );
}
