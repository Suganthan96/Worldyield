'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const VerifyButtonDynamic = dynamic(
  () => import('./WorldIDVerify').then((m) => m.VerifyButton),
  { ssr: false },
);

const STORAGE_KEY = 'worldyield_worldid_nullifier';

export default function WorldIDVerifyWrapper() {
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        console.log('[WorldID] Loaded from localStorage:', stored);
        if (stored) {
          setNullifier(stored);
        }
      } catch (error) {
        console.error('[WorldID] Error loading from localStorage:', error);
      }
    }
    setIsLoading(false);
  }, []);

  // Save to localStorage when verified
  const handleVerified = (hash: string) => {
    console.log('[WorldID] Saving to localStorage:', hash);
    try {
      localStorage.setItem(STORAGE_KEY, hash);
      setNullifier(hash);
    } catch (error) {
      console.error('[WorldID] Error saving to localStorage:', error);
    }
  };

  // Clear verification
  const handleClear = () => {
    console.log('[WorldID] Clearing verification');
    try {
      localStorage.removeItem(STORAGE_KEY);
      setNullifier(null);
    } catch (error) {
      console.error('[WorldID] Error clearing localStorage:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (nullifier) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-green-400 bg-green-50 text-center w-full max-w-3xl">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-semibold text-green-700">Verified Human</h2>
        <div className="w-full bg-white rounded-lg p-6 border border-green-200 shadow-sm">
          <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wide">World ID Nullifier Hash:</p>
          <div className="bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-base text-gray-900 break-words font-mono leading-relaxed select-all cursor-text">
              {nullifier}
            </p>
          </div>
          <p className="text-xs text-gray-400 mt-2">Click to select • Persists until cleared</p>
        </div>
        <button
          onClick={handleClear}
          className="text-sm text-red-500 hover:text-red-700 underline transition-colors font-medium"
        >
          Clear verification
        </button>
      </div>
    );
  }

  return <VerifyButtonDynamic onVerified={handleVerified} />;
}
