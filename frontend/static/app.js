/* ============================================
   SENTINEL — Frontend Application Logic
   ============================================ */

const API = {
  nonce:  '/api/auth/nonce/',
  verify: '/api/auth/verify/',
  upload: '/api/vault/upload/',
  files:  '/api/vault/files/',
  download: '/api/vault/download/',
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
   * Import a base64 string back into a CryptoKey for decryption.
   * @param {string} base64Key 
   * @returns {Promise<CryptoKey>}
   */
  async importKeyFromBase64(base64Key) {
    const binary = atob(base64Key);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return window.crypto.subtle.importKey(
      'raw',
      bytes.buffer,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt']
    );
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

  /**
   * Decrypts an encrypted blob using the provided base64 key.
   * @param {Blob} encryptedBlob 
   * @param {string} base64Key 
   * @returns {Promise<Blob>}
   */
  async decryptFile(encryptedBlob, base64Key) {
    const key = await this.importKeyFromBase64(base64Key);
    const buffer = await encryptedBlob.arrayBuffer();

    // Extract the 12-byte IV from the front
    const iv = buffer.slice(0, 12);
    const ciphertext = buffer.slice(12);

    // Decrypt
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext
    );

    return new Blob([decryptedBuffer]);
  }
};

// ─── State ─────────────────────────────────
let state = {
  walletAddress: null,
  connected: false,
  selectedFile: null,
  lastEncryptionKey: null,  // base64 key from the last upload
};

let pendingDownload = null;

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
  loadVaultFiles(); // Refresh vault list
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

  // Modern check for Phantom
  const provider = window.phantom?.solana || window.solana;

  if (!provider || !provider.isPhantom) {
    showToast('Phantom wallet not found. Please install Phantom.', 'error');
    window.open('https://phantom.app/', '_blank');
    return;
  }

  try {
    setButtonLoading(connectBtn, true);

    // 1. Connect to Phantom using the modern provider
    const resp = await provider.connect();
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
    const signedMessage = await provider.signMessage(message, 'utf8');

    // 4. Verify signature on backend
    const verifyResp = await fetch(API.verify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        signature: Array.from(signedMessage.signature),
      }),
    });

    const verifyData = await verifyResp.json();
    if (!verifyResp.ok) throw new Error(verifyData.error || 'Signature verification failed');

    // NEW: Save the JWT securely in memory/localStorage
    localStorage.setItem('sentinel_token', verifyData.token);

    // 5. Success — update state
    state.walletAddress = walletAddress;
    state.connected = true;
    updateWalletUI();
    showScreen('screenDashboard');
    showToast('Wallet connected successfully', 'success');
    loadVaultFiles(); // Fetch files for this wallet

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
  const provider = window.phantom?.solana || window.solana;
  if (provider) {
    provider.disconnect();
  }
  
  localStorage.removeItem('sentinel_token'); // NEW: Clear JWT session
  
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
  loadVaultFiles(); // Fetch files for the dev wallet
}

// ─── Vault File Listing & Decryption ───────
async function loadVaultFiles() {
  if (!state.walletAddress) return;
  
  const container = document.getElementById('vaultFilesBody');
  if(!container) return;
  
  try {
    container.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading vault contents...</td></tr>';
    
    const token = localStorage.getItem('sentinel_token');
    const resp = await fetch(`${API.files}?wallet=${state.walletAddress}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!resp.ok) throw new Error('Failed to load files');
    
    const files = await resp.json();
    
    if (files.length === 0) {
      container.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--gray-3);">No documents in your vault yet.</td></tr>';
      return;
    }

    container.innerHTML = files.map(file => `
      <tr>
        <td>${escapeHtml(file.file_name)}</td>
        <td class="mono-text">${truncateAddress(file.required_nft_address)}</td>
        <td>${new Date(file.uploaded_at).toLocaleDateString()}</td>
        <td>
          <button class="btn-ghost" onclick="promptDownload(${file.id}, '${escapeHtml(file.file_name)}')">Download</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading vault files:', err);
    container.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--gray-3);">Error loading your vault.</td></tr>';
  }
}

function promptDownload(fileId, fileName) {
  pendingDownload = { fileId, fileName };
  document.getElementById('keyPromptModal').classList.add('active');
  document.getElementById('decryptionKeyInput').value = '';
}

function closeKeyModal() {
  document.getElementById('keyPromptModal').classList.remove('active');
  pendingDownload = null;
}

async function confirmDownload() {
  const keyInput = document.getElementById('decryptionKeyInput').value.trim();
  if (!keyInput || !pendingDownload) {
    showToast('Encryption key is required', 'error');
    return;
  }

  const { fileId, fileName } = pendingDownload;
  closeKeyModal();

  try {
    showToast(`Retrieving encrypted blob...`, 'info');
    
    // NEW: Get the token and add it to the request headers
    const token = localStorage.getItem('sentinel_token');
    
    // 1. Fetch encrypted blob from the backend
    const resp = await fetch(`${API.download}${fileId}/`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!resp.ok) {
      // Parse error JSON from backend if access is denied
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to download document. Unauthorized.');
    }
    const encryptedBlob = await resp.blob();

    // 2. Decrypt locally
    showToast('Decrypting document locally...', 'info');
    const decryptedBlob = await CryptoUtils.decryptFile(encryptedBlob, keyInput);

    // 3. Trigger Browser Download
    const url = URL.createObjectURL(decryptedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName; // Restores original filename, dropping the .enc backend appends
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Decryption successful!', 'success');

  } catch (err) {
    console.error('Decryption error:', err);
    showToast(`Decryption failed: ${err.message}`, 'error');
  }
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

    const token = localStorage.getItem('sentinel_token');
    const resp = await fetch(API.upload, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
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