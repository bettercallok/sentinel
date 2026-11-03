import { useCallback, useState } from 'react';
import { Background } from './components/Background';
import { Navbar } from './components/Navbar';
import { LandingScreen } from './screens/LandingScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { SharedDocumentScreen } from './screens/SharedDocumentScreen';
import { useAuth } from './hooks/useAuth';
import { clearShareParams, readShareParams, type ShareParams } from './lib/share';
import { APP_VERSION } from './config';
import type { DocumentResponse } from './types';

type Screen = 'dashboard' | 'success' | 'shared';

interface UploadResult {
  document: DocumentResponse;
  encryptionKey: string;
}

function initialShare(): ShareParams {
  const params = readShareParams();
  // Get the key out of the address bar / history entry straight away.
  if (params.key) clearShareParams();
  return params;
}

export default function App() {
  const { isConnected, isRestoring } = useAuth();
  const [share, setShare] = useState<ShareParams>(initialShare);
  const [screen, setScreen] = useState<Screen>(() => (share.docId ? 'shared' : 'dashboard'));
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleUploadSuccess = useCallback((data: DocumentResponse, encryptionKey: string) => {
    setUploadResult({ document: data, encryptionKey });
    setScreen('success');
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setUploadResult(null);
    setScreen('dashboard');
  }, []);

  const handleSharedDone = useCallback(() => {
    clearShareParams();
    setShare({ docId: null, key: null });
    setScreen('dashboard');
  }, []);

  // Screens other than the landing page require a session; deriving this
  // during render (instead of syncing state in an effect) avoids flicker loops.
  let content;
  if (isRestoring) {
    content = (
      <section className="screen active">
        <div className="landing-content">
          <p className="landing-subtitle"><span className="spinner" /> Restoring your session...</p>
        </div>
      </section>
    );
  } else if (!isConnected) {
    content = <LandingScreen sharedDocument={share.docId !== null} />;
  } else if (screen === 'shared' && share.docId) {
    content = <SharedDocumentScreen docId={share.docId} initialKey={share.key} onDone={handleSharedDone} />;
  } else if (screen === 'success' && uploadResult) {
    content = (
      <SuccessScreen
        document={uploadResult.document}
        encryptionKey={uploadResult.encryptionKey}
        onBack={handleBackToDashboard}
      />
    );
  } else {
    content = <DashboardScreen onUploadSuccess={handleUploadSuccess} />;
  }

  return (
    <>
      <Background />
      <div className="app-container">
        <Navbar />
        {content}
        <footer className="footer">
          <span>SENTINEL v{APP_VERSION}</span>
          <span>Built on Solana</span>
        </footer>
      </div>
    </>
  );
}
