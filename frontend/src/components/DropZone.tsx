import { useCallback, useRef, useState, type DragEvent } from 'react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onFileRemove: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function DropZone({ onFileSelect, selectedFile, onFileRemove }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileRemove();
      if (inputRef.current) inputRef.current.value = '';
    },
    [onFileRemove],
  );

  return (
    <div
      className={`drop-zone${dragOver ? ' drag-over' : ''}`}
      id="dropZone"
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="drop-zone-icon">📁</div>
      <p className="drop-zone-text">
        Drop your file here, or <strong style={{ color: 'var(--white)' }}>browse</strong>
      </p>
      <p className="drop-zone-hint">Any file type accepted</p>
      <input
        ref={inputRef}
        type="file"
        id="fileInput"
        name="encrypted_file"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {selectedFile && (
        <div className="drop-zone-file-info visible" id="fileInfo">
          <span className="file-icon">📄</span>
          <div className="file-details">
            <div className="file-name" id="fileName">{selectedFile.name}</div>
            <div className="file-size" id="fileSize">{formatBytes(selectedFile.size)}</div>
          </div>
          <button type="button" className="file-remove" onClick={handleRemove}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
