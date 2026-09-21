import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const AudioCtx = createContext(null);

// Bọc CalmAudioEngine hiện có (assets/js/audio.js) thành singleton sống suốt SPA.
// Khắc phục lỗi cũ: nhạc dừng mỗi lần chuyển trang MPA.
export function AudioProvider({ children }) {
  const engineRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState({ id: 'ocean', title: 'Sóng Biển 432Hz', subtitle: '' });
  const [volume, setVolumeState] = useState(0.65);
  const [sleepMinutes, setSleepMinutes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // import side-effect: file tự tạo window.calmAudio + window.CALM_TRACKS
      await import('../assets/js/audio.js');
      if (cancelled) return;
      const engine = window.calmAudio;
      engineRef.current = engine || null;
      if (engine) {
        try {
          const t = engine.getCurrentTrack();
          setTrack({ id: engine.currentTrackId, title: t.title, subtitle: t.subtitle });
          setVolumeState(engine.volume);
          setIsPlaying(engine.isPlaying);
          setSleepMinutes(engine.sleepMinutes || 0);
        } catch {
          /* bỏ qua */
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sync = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const t = engine.getCurrentTrack();
      setTrack({ id: engine.currentTrackId, title: t.title, subtitle: t.subtitle });
      setVolumeState(engine.volume);
      setIsPlaying(engine.isPlaying);
      setSleepMinutes(engine.sleepMinutes || 0);
    } catch {
      /* bỏ qua */
    }
  }, []);

  const togglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
    sync();
  }, [sync]);

  const switchTrack = useCallback(
    (id) => {
      engineRef.current?.switchTrack(id);
      sync();
    },
    [sync],
  );

  const nextTrack = useCallback(() => {
    engineRef.current?.nextTrack();
    if (engineRef.current && !engineRef.current.isPlaying) engineRef.current.playCurrentTrack();
    sync();
  }, [sync]);

  const setVolume = useCallback(
    (v) => {
      engineRef.current?.setVolume(v);
      sync();
    },
    [sync],
  );

  const setSleepTimer = useCallback(
    (minutes) => {
      engineRef.current?.setSleepTimer(minutes);
      setSleepMinutes(minutes);
      sync();
    },
    [sync],
  );

  const value = useMemo(
    () => ({
      ready,
      isPlaying,
      track,
      volume,
      sleepMinutes,
      togglePlay,
      switchTrack,
      nextTrack,
      setVolume,
      setSleepTimer,
      engine: () => engineRef.current,
    }),
    [ready, isPlaying, track, volume, sleepMinutes, togglePlay, switchTrack, nextTrack, setVolume, setSleepTimer],
  );

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio phải dùng trong <AudioProvider>');
  return ctx;
}
