import { useCallback, useEffect, useState } from 'react';
import { Background } from './components/Background';
import { Navbar } from './components/Navbar';
import { LandingScreen } from './screens/LandingScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { useAuth } from './hooks/useAuth';
import type { DocumentResponse } from './types';

type Screen = 'landing' | 'dashboard' | 'success';

interface UploadResult {
  document: DocumentResponse;
  encryptionKey: string;
}

export default function App() {
  const { isConnected } = useAuth();
  const [screen, setScreen] = useState<Screen>(isConnected ? 'dashboard' : 'landing');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleConnected = useCallback(() => {
    setScreen('dashboard');
  }, []);

  const handleUploadSuccess = useCallback((data: DocumentResponse, encryptionKey: string) => {
    setUploadResult({ document: data, encryptionKey });
    setScreen('success');
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setUploadResult(null);
    setScreen('dashboard');
  }, []);

  // Reset to landing when disconnected — must be in useEffect to avoid render-loop
  useEffect(() => {
    if (!isConnected && screen !== 'landing') {
      setScreen('landing');
      setUploadResult(null);
    }
  }, [isConnected, screen]);

  return (
    <>
      <Background />
      <div className="app-container">
        <Navbar />

        {screen === 'landing' && (
          <LandingScreen onConnected={handleConnected} />
        )}

        {screen === 'dashboard' && (
          <DashboardScreen onUploadSuccess={handleUploadSuccess} />
        )}

        {screen === 'success' && uploadResult && (
          <SuccessScreen
            document={uploadResult.document}
            encryptionKey={uploadResult.encryptionKey}
            onBack={handleBackToDashboard}
          />
        )}

        <footer className="footer">
          <span>SENTINEL v2.0</span>
          <span>Built on Solana</span>
        </footer>
      </div>
    </>
  );
}
