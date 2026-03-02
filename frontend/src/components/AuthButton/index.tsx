'use client';
import { walletAuth } from '@/auth/wallet';
import { Button, LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * This component is an example of how to authenticate a user
 * We will use Next Auth for this example, but you can use any auth provider
 * Read More: https://docs.world.org/mini-apps/commands/wallet-auth
 */
export const AuthButton = () => {
  console.log('AuthButton render');
  const [isPending, setIsPending] = useState(false);
  const { isInstalled } = useMiniKit();
  const hasAttemptedAuth = useRef(false);

  console.log('AuthButton state:', { isPending, isInstalled });

  const onClick = useCallback(async () => {
    if (!isInstalled) {
      alert('⚠️ This app must be opened inside the World App.\n\nPlease scan the QR code from your World App.');
      console.warn('MiniKit not detected. Please open this app inside World App.');
      return;
    }
    if (isPending) {
      return;
    }
    setIsPending(true);
    try {
      await walletAuth();
    } catch (error) {
      console.error('Wallet authentication button error', error);
    } finally {
      setIsPending(false);
    }
  }, [isInstalled, isPending]);

  // Auto-authenticate on load when MiniKit is ready
  useEffect(() => {
    console.log('AuthButton effect:', {
      isInstalled,
      hasAttemptedAuth: hasAttemptedAuth.current,
    });
    if (isInstalled === true && !hasAttemptedAuth.current) {
      console.log('Firing walletAuth automatically');
      hasAttemptedAuth.current = true;
      setIsPending(true);
      walletAuth()
        .catch((error) => {
          console.error('Auto wallet authentication error', error);
        })
        .finally(() => {
          setIsPending(false);
        });
    }
  }, [isInstalled]);

  return (
    <div className="flex flex-col items-center gap-4">
      {!isInstalled && (
        <div className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg max-w-md text-center">
          ⚠️ Please open this app inside the World App to use wallet features
        </div>
      )}
      <LiveFeedback
        label={{
          failed: 'Failed to login',
          pending: 'Logging in',
          success: 'Logged in',
        }}
        state={isPending ? 'pending' : undefined}
      >
        <Button
          onClick={onClick}
          disabled={isPending || !isInstalled}
          size="lg"
          variant="primary"
        >
          {!isInstalled ? 'World App Required' : 'Login with Wallet'}
        </Button>
      </LiveFeedback>
    </div>
  );
};
