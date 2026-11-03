import { useCallback, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';

interface LandingScreenProps {
  /** True when the user arrived via a share link. */
  sharedDocument?: boolean;
}

export function LandingScreen({ sharedDocument = false }: LandingScreenProps) {
  const { connect } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      await connect();
      showToast('Wallet connected successfully', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      if (/rejected/i.test(msg)) {
        showToast('Signature request was cancelled', 'info');
      } else {
        showToast(msg, 'error');
      }
      // If Phantom is not installed, open their site
      if (msg.includes('not found')) {
        window.open('https://phantom.app/', '_blank', 'noopener,noreferrer');
      }
    } finally {
      setLoading(false);
    }
  }, [connect, showToast]);

  return (
    <section className="screen active" id="screenLanding">
      <div className="landing-content">
        <div className="landing-eyebrow">
          <span className="pulse" />
          Solana Powered
        </div>

        <h1 className="landing-title">
          Your documents,<br />
          <em>sealed</em> on-chain.
        </h1>

        <p className="landing-subtitle">
          {sharedDocument
            ? 'Someone shared an NFT-gated document with you. Connect your wallet to check access and unlock it.'
            : 'Sentinel is an NFT-gated vault for encrypted documents. Only verified holders can access what you protect.'}
        </p>

        <button
          className={`btn btn-primary${loading ? ' loading' : ''}`}
          id="connectBtn"
          onClick={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" /> Processing...
            </>
          ) : (
            <>
              <span className="btn-shine" />
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Connect Phantom Wallet
            </>
          )}
        </button>

        <p className="landing-footnote">
          Signing in only asks your wallet to sign a message — no transaction, no fees.
          Files are encrypted in your browser; the server never sees your keys.
        </p>
      </div>
    </section>
  );
}

