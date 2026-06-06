import { useEffect } from 'react';

export default function Sheet({ open, onClose, children, dialog = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={`overlay ${dialog ? 'center' : ''}`} onClick={onClose}>
      <div className={`sheet ${dialog ? 'dialog' : ''}`} onClick={(e) => e.stopPropagation()}>
        {!dialog && <div className="grabber" />}
        {children}
      </div>
    </div>
  );
}
