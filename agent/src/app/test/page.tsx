'use client';

import { useState } from 'react';

export default function TestPage() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const testAgent = async () => {
    setLoading(true);
    setResponse('');
    
    try {
      const res = await fetch('/api/test-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      
      if (data.success) {
        setResponse(data.response || JSON.stringify(data, null, 2));
      } else {
        setResponse(`Error: ${data.error || JSON.stringify(data)}`);
      }
    } catch (error) {
      setResponse(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6">VeraYield Agent Test</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Message to Agent:
            </label>
            <textarea
              className="w-full border rounded-md p-2 h-24"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's the best yield option right now?"
            />
          </div>

          <button
            onClick={testAgent}
            disabled={loading || !message}
            className="w-full bg-blue-600 text-white py-2 px-4 roundedmd hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Processing...' : 'Test Agent'}
          </button>

          {response && (
            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-2">Response:</h2>
              <pre className="bg-gray-50 p-4 rounded-md overflow-auto whitespace-pre-wrap">
                {response}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
