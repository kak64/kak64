import { useEffect, useRef, useState, useCallback } from 'react';

// Polls an async loader on an interval and whenever `deps` change.
// Pauses while the tab is hidden, refetches on focus.
export function usePoll(loader, deps = [], interval = 4000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = useCallback(async () => {
    try {
      const d = await loaderRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer;
    const tick = async () => {
      if (document.hidden) return;
      await refresh();
    };
    setLoading(true);
    refresh();
    timer = setInterval(() => alive && tick(), interval);
    const onFocus = () => alive && tick();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh, setData };
}
