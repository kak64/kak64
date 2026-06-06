import { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet.jsx';
import Icon from '../lib/icons.jsx';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Split a spoken phrase into separate items: commas, newlines, and the
// Hebrew conjunction "ו" that's attached to the next word ("חלב, ביצים ולחם").
function parseItems(text) {
  let t = ' ' + text.trim() + ' ';
  // strip common leading filler words
  t = t.replace(/\b(תוסיף|הוסף|להוסיף|תרשום|צריך|צריכים|לקנות|רשום)\b/g, ' ');
  return t
    .split(/[,\n]|\sו(?=[א-ת])|\sגם\s|\sועוד\s/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export default function VoiceModal({ open, title, onClose, onAdd }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState([]);
  const [typed, setTyped] = useState('');
  const recRef = useRef(null);

  const stop = () => {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  };

  const start = () => {
    if (!SR) return;
    setTranscript('');
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let full = '';
      for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript + ' ';
      setTranscript(full.trim());
      setItems(parseItems(full));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  // auto-start mic when the sheet opens (if supported)
  useEffect(() => {
    if (open && SR) start();
    if (!open) { stop(); setTranscript(''); setItems([]); setTyped(''); }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finish = () => {
    stop();
    const list = SR ? items : parseItems(typed);
    if (list.length) onAdd(list);
    onClose();
  };

  const removeChip = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  return (
    <Sheet open={open} onClose={onClose}>
      <h2>{title}</h2>
      <div className="voice">
        {SR ? (
          <>
            <div className="mic-wrap">
              {listening && (<>
                <span className="pulse" /><span className="pulse d2" /><span className="pulse d3" />
              </>)}
              <button className="mic-btn" onClick={listening ? stop : start} aria-label="הקלטה">
                <Icon name="mic" size={36} />
              </button>
            </div>
            <div className="transcript">{transcript || <span style={{ color: '#b8ada1' }}>מאזין... תגיד מה לרשום.</span>}</div>
            {listening && <div className="listening"><Icon name="bell" size={14} /> מקליט</div>}

            {items.length > 0 && (
              <div className="chips">
                {items.map((it, i) => (
                  <span key={i} className="chip active" onClick={() => removeChip(i)}>
                    {it} ✕
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '10px 0 4px' }}>
            <p className="note">הדפדפן לא תומך בהקלטה קולית — אפשר להקליד פריטים מופרדים בפסיק.</p>
            <input
              className="input"
              autoFocus
              placeholder="חלב, ביצים, לחם..."
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && finish()}
            />
          </div>
        )}

        <button className="btn" style={{ marginTop: 18 }} onClick={finish} disabled={SR ? !items.length : !typed.trim()}>
          {SR ? `הוספת ${items.length || ''} פריטים` : 'הוספה'}
        </button>
      </div>
    </Sheet>
  );
}
