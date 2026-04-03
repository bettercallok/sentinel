/* ============================================
   SENTINEL — Frontend Application Logic
   ============================================ */

const API = {
  nonce:  '/api/auth/nonce/',
  verify: '/api/auth/verify/',
  upload: '/api/vault/upload/',
};

// ─── CryptoUtils (AES-256-GCM) ────────────
const CryptoUtils = {
  /**
   * Generate a random AES-256-GCM key.
   * @returns {Promise<CryptoKey>}
   */
  async generateKey() {
    return window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,  // extractable — so we can export it for the user
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Export a CryptoKey to a base64 string for display/storage.
   * @param {CryptoKey} key
   * @returns {Promise<string>}
   */
  async exportKeyToBase64(key) {
    const raw = await window.crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(raw);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
  },

  /**
   * Encrypt a File using AES-256-GCM.
   * Returns a Blob with format: [12-byte IV][ciphertext + GCM auth tag]
   * @param {File} file
   * @param {CryptoKey} key
   * @returns {Promise<{encryptedBlob: Blob, exportedKey: string}>}
   */
  async encryptFile(file, key) {
    // Read file into ArrayBuffer
    const fileBuffer = await file.arrayBuffer();

    // Generate a random 12-byte IV (recommended for GCM)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-256-GCM
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      fileBuffer
    );

    // Prepend IV to ciphertext so it can be extracted during decryption
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    const encryptedBlob = new Blob([combined], { type: 'application/octet-stream' });
    const exportedKey = await this.exportKeyToBase64(key);

    return { encryptedBlob, exportedKey };
  },
};

// ─── State ─────────────────────────────────
let state = {
  walletAddress: null,
  connected: false,
  selectedFile: null,
  lastEncryptionKey: null,  // base64 key from the last upload
};

// ─── Screen Navigation ────────────────────
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    // Re-trigger animation
    target.style.animation = 'none';
    target.offsetHeight; // force reflow
    target.style.animation = '';
  }
}

function goToDashboard() {
  resetForm();
  // Hide encryption key from previous upload
  const keyDisplay = document.getElementById('encryptionKeyDisplay');
  if (keyDisplay) keyDisplay.style.display = 'none';
  showScreen('screenDashboard');
}

// ─── Wallet Utils ──────────────────────────
function truncateAddress(addr) {
  if (!addr) return '—';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function updateWalletUI() {
  const badge = document.getElementById('walletBadge');
  const badgeAddr = document.getElementById('walletBadgeAddress');
  const disconnectBtn = document.getElementById('disconnectBtn');

  if (state.connected && state.walletAddress) {
    badge.style.display = 'flex';
    badgeAddr.textContent = truncateAddress(state.walletAddress);
    disconnectBtn.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
    disconnectBtn.style.display = 'none';
  }
}

// ─── Wallet Connect ───────────────────────
async function connectWallet() {
  const connectBtn = document.getElementById('connectBtn');

  // Check for Phantom
  if (!window.solana || !window.solana.isPhantom) {
    showToast('Phantom wallet not found. Please install Phantom.', 'error');
    window.open('https://phantom.app/', '_blank');
    return;
  }

  try {
    setButtonLoading(connectBtn, true);

    // 1. Connect to Phantom
    const resp = await window.solana.connect();
    const walletAddress = resp.publicKey.toString();

    // 2. Request nonce from backend
    const nonceResp = await fetch(API.nonce, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress }),
    });

    if (!nonceResp.ok) throw new Error('Failed to get nonce');
    const nonceData = await nonceResp.json();

    // 3. Sign the nonce with Phantom
    const message = new TextEncoder().encode(nonceData.nonce);
    const signedMessage = await window.solana.signMessage(message, 'utf8');

    // 4. Verify signature on backend
    const verifyResp = await fetch(API.verify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        signature: Array.from(signedMessage.signature),
      }),
    });

    if (!verifyResp.ok) throw new Error('Signature verification failed');

    // 5. Success — update state
    state.walletAddress = walletAddress;
    state.connected = true;
    updateWalletUI();
    showScreen('screenDashboard');
    showToast('Wallet connected successfully', 'success');

  } catch (err) {
    console.error('Wallet connection error:', err);
    if (err.message !== 'User rejected the request.') {
      showToast(err.message || 'Connection failed', 'error');
    }
  } finally {
    setButtonLoading(connectBtn, false);
  }
}

function disconnectWallet() {
  if (window.solana) {
    window.solana.disconnect();
  }
  state.walletAddress = null;
  state.connected = false;
  state.lastEncryptionKey = null;
  updateWalletUI();
  showScreen('screenLanding');
  showToast('Wallet disconnected', 'success');
}

// ─── Dev Bypass (testing without Phantom) ──
function devConnect() {
  state.walletAddress = 'DEV_' + Math.random().toString(36).substring(2, 10).toUpperCase();
  state.connected = true;
  updateWalletUI();
  showScreen('screenDashboard');
  showToast('Dev mode — connected as ' + truncateAddress(state.walletAddress), 'success');
}

// ─── File Handling ─────────────────────────
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  state.selectedFile = file;
  const fileInfo = document.getElementById('fileInfo');
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);
  fileInfo.classList.add('visible');
}

function removeFile(e) {
  e.stopPropagation();
  state.selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInfo').classList.remove('visible');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Drag & Drop ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;

  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const input = document.getElementById('fileInput');
      input.files = files;
      handleFileSelect(input);
    }
  });
});

// ─── Upload ───────────────────────────────
async function uploadFile(e) {
  e.preventDefault();
  const uploadBtn = document.getElementById('uploadBtn');

  if (!state.selectedFile) {
    showToast('Please select a file to upload', 'error');
    return;
  }

  const nftAddress = document.getElementById('nftAddress').value.trim();
  if (!nftAddress) {
    showToast('Please enter an NFT address', 'error');
    return;
  }

  try {
    setButtonLoading(uploadBtn, true);

    // ── Client-side encryption (AES-256-GCM) ──
    showToast('Encrypting file...', 'info');
    const cryptoKey = await CryptoUtils.generateKey();
    const { encryptedBlob, exportedKey } = await CryptoUtils.encryptFile(state.selectedFile, cryptoKey);
    state.lastEncryptionKey = exportedKey;

    // Build FormData with the encrypted blob (server never sees raw file)
    const formData = new FormData();
    formData.append('uploader_wallet', state.walletAddress);
    formData.append('file_name', state.selectedFile.name);
    formData.append('encrypted_file', encryptedBlob, state.selectedFile.name + '.enc');
    formData.append('required_nft_address', nftAddress);

    const resp = await fetch(API.upload, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const errData = await resp.json();
      throw new Error(JSON.stringify(errData));
    }

    const data = await resp.json();

    // Show success screen with details + encryption key
    const details = document.getElementById('successDetails');
    details.innerHTML = `
      <div class="success-detail-row">
        <span class="success-detail-label">File</span>
        <span class="success-detail-value">${escapeHtml(data.file_name)}</span>
      </div>
      <div class="success-detail-row">
        <span class="success-detail-label">Uploader</span>
        <span class="success-detail-value">${truncateAddress(data.uploader_wallet)}</span>
      </div>
      <div class="success-detail-row">
        <span class="success-detail-label">NFT Gate</span>
        <span class="success-detail-value">${truncateAddress(data.required_nft_address)}</span>
      </div>
      <div class="success-detail-row">
        <span class="success-detail-label">Uploaded</span>
        <span class="success-detail-value">${new Date(data.uploaded_at).toLocaleString()}</span>
      </div>
    `;

    // Show the encryption key
    const keyDisplay = document.getElementById('encryptionKeyDisplay');
    const keyValue = document.getElementById('encryptionKeyValue');
    if (keyDisplay && keyValue) {
      keyValue.textContent = exportedKey;
      keyDisplay.style.display = 'block';
    }

    showScreen('screenSuccess');
    showToast('Document encrypted & sealed!', 'success');

  } catch (err) {
    console.error('Upload error:', err);
    showToast('Upload failed. Check the console for details.', 'error');
  } finally {
    setButtonLoading(uploadBtn, false);
  }
}

function resetForm() {
  state.selectedFile = null;
  document.getElementById('uploadForm').reset();
  document.getElementById('fileInfo').classList.remove('visible');
}

// ─── UI Helpers ───────────────────────────
function setButtonLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'error' ? '✕' : '✓';
  toast.innerHTML = `<span>${icon}</span> ${escapeHtml(message)}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = `fadeOutToast ${300}ms var(--ease-out) forwards`;
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function copyEncryptionKey() {
  const key = document.getElementById('encryptionKeyValue').textContent;
  navigator.clipboard.writeText(key).then(() => {
    showToast('Encryption key copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback: select the text
    const range = document.createRange();
    range.selectNode(document.getElementById('encryptionKeyValue'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    showToast('Key selected — press Ctrl+C to copy', 'info');
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
