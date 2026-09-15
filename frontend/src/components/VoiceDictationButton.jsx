import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, X, Sparkles, Volume2, Check, ArrowRight, RefreshCw } from 'lucide-react';
import { useUI } from '../context/UIContext';
import clsx from 'clsx';

/**
 * VoiceDictationButton
 * Web Speech API-powered hands-free dictation for clinical field nurses.
 * Features:
 * - Real-time speech-to-text with interim and final transcript preview.
 * - en-IN localization for Indian clinical terminology.
 * - Resilient continuous listening lifecycle preventing premature aborts.
 * - Browser microphone permission preflight check via getUserMedia.
 * - Visual animated audio frequency bars when actively listening.
 * - 1-Click Quick Voice Presets for seamless zero-mic / muted environment testing.
 * - Custom Simulated Voice input field for instant testability on any browser/hardware.
 */
export function VoiceDictationButton({
  onTranscript,
  className = '',
  size = 'sm',
  disabled = false,
  tooltip = 'Click to dictate (Speech-to-Text)',
  sampleOptions = [],
  position = 'below', // 'below' | 'above'
}) {
  const { language, t } = useUI();
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [customSimText, setCustomSimText] = useState('');
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  const panelRef = useRef(null);

  // Keep latest onTranscript callback without re-triggering recognition lifecycle
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Check browser speech support on mount
  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!showPanel) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false);
        stopListening();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPanel]);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    setIsListening(false);
  };

  const startListening = async () => {
    setErrorMsg(null);
    setLiveTranscript('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMsg('Web Speech API is not supported in this browser. Use Chrome or Edge, or select a preset below.');
      return;
    }

    // Trigger permission preflight if available to show native browser prompt
    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop audio tracks right after permission verification so SpeechRecognition can bind
        stream.getTracks().forEach((track) => track.stop());
      } catch (permErr) {
        console.warn('[VoiceDictation] Mic permission preflight note:', permErr);
        if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
          setErrorMsg('Microphone blocked. Please click the lock or camera icon in your address bar to allow microphone access.');
          setIsListening(false);
          return;
        } else if (permErr.name === 'NotFoundError' || permErr.name === 'DevicesNotFoundError') {
          setErrorMsg('No physical microphone found on your computer. You can use the quick presets below.');
          setIsListening(false);
          return;
        }
      }
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Stay active while user speaks
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = language === 'mr' ? 'mr-IN' : language === 'hi' ? 'hi-IN' : 'en-IN'; // Marathi / Hindi / Indian English

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event) => {
        let fullFinal = '';
        let interim = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            fullFinal += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const text = (fullFinal + interim).trim();
        if (text) {
          setLiveTranscript(text);
          onTranscriptRef.current?.(text);
        }
      };

      recognition.onerror = (event) => {
        console.warn('[VoiceDictation] Error event:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone blocked. Please allow mic permissions in your browser address bar.');
          setIsListening(false);
        } else if (event.error === 'no-speech') {
          setErrorMsg('Listening for voice... Speak clearly or tap a preset below.');
          // Don't kill listening on simple silence
        } else if (event.error === 'audio-capture') {
          setErrorMsg('No working microphone found on your system. Use the quick presets below.');
          setIsListening(false);
        } else if (event.error === 'network') {
          setErrorMsg('Speech recognition cloud unreachable. You can use the quick presets below.');
          setIsListening(false);
        } else if (event.error !== 'aborted') {
          setErrorMsg(`Voice notice: ${event.error}`);
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('[VoiceDictation] Failed to start recognition:', err);
      setErrorMsg('Could not start microphone listener. Try clicking a quick preset below.');
      setIsListening(false);
    }
  };

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    if (showPanel) {
      setShowPanel(false);
      stopListening();
    } else {
      setShowPanel(true);
      if (isSupported) {
        startListening();
      }
    }
  };

  const handleApplyPreset = (presetText) => {
    const clean = presetText.trim();
    if (!clean) return;
    setLiveTranscript(clean);
    onTranscriptRef.current?.(clean);
    stopListening();
    setTimeout(() => {
      setShowPanel(false);
    }, 450);
  };

  return (
    <div className="relative inline-flex items-center" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        title={tooltip}
        aria-label={isListening ? 'Stop voice recording' : 'Start voice dictation'}
        aria-pressed={isListening}
        className={clsx(
          'relative p-1.5 rounded-lg transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer',
          isListening
            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 ring-2 ring-rose-300'
            : showPanel
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        {isListening ? (
          <>
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
            </span>
            <Mic className={size === 'xs' ? 'w-3.5 h-3.5 animate-pulse' : 'w-4 h-4 animate-pulse'} />
          </>
        ) : (
          <Mic className={size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        )}
      </button>

      {/* Interactive Speech & Quick Presets Popover Panel */}
      {showPanel && (
        <div
          role="dialog"
          aria-label="Hands-free voice dictation dialog"
          className={clsx(
            'absolute right-0 w-80 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 text-xs space-y-3 animate-fade-in',
            position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t('voice_dictation_title', 'Hands-Free Voice Dictation')}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPanel(false);
                stopListening();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close dialog"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Active Listening Status Card */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isListening ? (
                  <div className="flex items-center gap-0.5 h-4">
                    <span className="w-1 h-3 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-4 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-2.5 bg-rose-500 rounded-full animate-bounce"></span>
                    <span className="w-1 h-4 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
                  </div>
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                )}
                <span className="font-semibold text-slate-800 dark:text-slate-100 text-[11px]">
                  {isListening ? t('voice_dictation_listening', 'Listening live... Speak now') : t('voice_dictation_idle', 'Microphone idle')}
                </span>
              </div>

              {isSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg font-bold text-[11px] transition shadow-xs flex items-center gap-1',
                    isListening
                      ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  )}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-3 h-3" />
                      <span>{t('voice_dictation_stop', 'Stop')}</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3 h-3" />
                      <span>{t('voice_dictation_speak', 'Speak')}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Live Transcript Display */}
            {liveTranscript ? (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-medium text-[11px] flex items-center justify-between">
                <span>"{liveTranscript}"</span>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">
                Speak clinical terms (e.g. "Paracetamol", "Snakebite", "OPD-9214")...
              </p>
            )}

            {/* Error Message Notice */}
            {errorMsg && (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[10px] flex items-start gap-1.5 leading-tight">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Quick Voice Simulation Presets */}
          {sampleOptions && sampleOptions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>{t('voice_dictation_presets', '1-Click Voice Presets (Works Without Mic)')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sampleOptions.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplyPreset(opt)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 dark:bg-slate-800 dark:hover:bg-emerald-950 text-slate-800 dark:text-slate-200 hover:text-emerald-900 dark:hover:text-emerald-200 font-semibold text-[11px] border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition cursor-pointer"
                  >
                    ⚡ {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Voice Simulation Field */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 block">
              Or Type Custom Simulated Voice
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customSimText}
                onChange={(e) => setCustomSimText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyPreset(customSimText);
                  }
                }}
                placeholder="e.g. Rabies Vaccine..."
                className="flex-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleApplyPreset(customSimText)}
                disabled={!customSimText.trim()}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-[11px] flex items-center gap-1 transition"
              >
                <span>Apply</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
