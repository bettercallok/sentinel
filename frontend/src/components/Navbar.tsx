import { useAuth } from '../hooks/useAuth';

function truncateAddress(addr: string | null): string {
  if (!addr) return '—';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

export function Navbar() {
  const { isConnected, walletAddress, disconnect } = useAuth();

  return (
    <nav className="navbar" id="navbar">
      <a href="/" className="navbar-logo">
        <div className="logo-icon">S</div>
        <span className="logo-text">Sentinel</span>
      </a>
      <div className="navbar-status">
        {isConnected && walletAddress && (
          <>
            <div className="wallet-badge" id="walletBadge">
              <span className="dot" />
              <span id="walletBadgeAddress">{truncateAddress(walletAddress)}</span>
            </div>
            <button
              className="btn btn-danger"
              id="disconnectBtn"
              onClick={disconnect}
            >
              Disconnect
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
