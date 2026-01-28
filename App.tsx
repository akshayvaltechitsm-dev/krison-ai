
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Command, Activity, AlertTriangle, XCircle, Zap, Mic, Key } from 'lucide-react';
import { VoiceState, AssistantVoice } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audio-utils';
import Transcription from './components/Transcription';
import SpatialRing from './components/SpatialRing';

interface TranscriptionEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const App: React.FC = () => {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isSpeaking: false,
    isConnected: false,
    isConnecting: false,
  });
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentAssistantText, setCurrentAssistantText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);

  // Refs to handle transcription state within the session callback without causing stale closures or re-initializations
  const userTextRef = useRef('');
  const assistantTextRef = useRef('');

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = window.setTimeout(() => setErrorMessage(null), 8000);
  }, []);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        try { session.close(); } catch(e) {}
      });
      sessionRef.current = null;
    }
    
    setVoiceState({ isListening: false, isSpeaking: false, isConnected: false, isConnecting: false });
    
    if (audioContextsRef.current) {
      audioContextsRef.current.input.close().catch(() => {});
      audioContextsRef.current.output.close().catch(() => {});
      audioContextsRef.current = null;
    }
    
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
  }, []);

  const handleKeySelection = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      // Assume success and clear error state
      setNeedsApiKey(false);
      startSession();
    } else {
      showError("Key management system unavailable in this environment.");
    }
  };

  const startSession = useCallback(async () => {
    if (voiceState.isConnecting || voiceState.isConnected) return;
    setHasInteracted(true);
    setNeedsApiKey(false);

    try {
      const aistudio = (window as any).aistudio;
      if (aistudio && !(await aistudio.hasSelectedApiKey())) {
        setNeedsApiKey(true);
        setVoiceState(prev => ({ ...prev, isConnecting: false }));
        return;
      }

      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        showError("Neural link requires a valid access key. Please configure environment.");
        setVoiceState(prev => ({ ...prev, isConnecting: false }));
        return;
      }

      setVoiceState(prev => ({ ...prev, isConnecting: true }));

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        showError("Microphone access is restricted. Enable permissions for link.");
        setVoiceState(prev => ({ ...prev, isConnecting: false }));
        return;
      }

      // Initialize GoogleGenAI instance right before connecting to ensure the latest API key is used
      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setVoiceState(prev => ({ ...prev, isConnected: true, isListening: true, isConnecting: false }));
            setErrorMessage(null);
            
            setTranscriptionHistory(prev => [
              ...prev,
              { id: 'welcome-' + Date.now(), role: 'assistant', text: "Neural link established. Welcome to Horizon OS. I am your spatial assistant." }
            ]);

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              // Use sessionPromise to prevent race conditions during initialization
              sessionPromise.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process transcriptions
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              assistantTextRef.current += text;
              setCurrentAssistantText(assistantTextRef.current);
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              userTextRef.current += text;
              setCurrentUserText(userTextRef.current);
            }

            if (message.serverContent?.turnComplete) {
              const uText = userTextRef.current;
              const aText = assistantTextRef.current;
              setTranscriptionHistory(prev => {
                const newHistory = [...prev];
                if (uText) newHistory.push({ id: Date.now() + '-u', role: 'user', text: uText });
                if (aText) newHistory.push({ id: Date.now() + '-a', role: 'assistant', text: aText });
                return newHistory.slice(-6);
              });
              userTextRef.current = '';
              assistantTextRef.current = '';
              setCurrentUserText('');
              setCurrentAssistantText('');
            }

            // Process audio output
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setVoiceState(prev => ({ ...prev, isSpeaking: true }));
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              // Using custom raw PCM decoding logic as required by Live API guidelines
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const sourceNode = outputCtx.createBufferSource();
              sourceNode.buffer = buffer;
              sourceNode.connect(outputCtx.destination);
              sourceNode.addEventListener('ended', () => {
                sourcesRef.current.delete(sourceNode);
                if (sourcesRef.current.size === 0) setVoiceState(prev => ({ ...prev, isSpeaking: false }));
              });
              sourceNode.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(sourceNode);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setVoiceState(prev => ({ ...prev, isSpeaking: false }));
            }
          },
          onerror: (e: any) => {
            console.error("Live Session Error:", e);
            const msg = e?.message || "";
            // Special handling for key errors as per Veo/Live guidelines
            if (msg.includes("Requested entity was not found") || msg.includes("API_KEY_INVALID")) {
              showError("Link rejected. Key might be invalid or from unpaid project.");
              setNeedsApiKey(true);
              stopSession();
            } else {
              showError("Neural bridge sync failure. Attempting recalibration...");
              handleAutoReconnect();
            }
          },
          onclose: (e) => {
            if (!e.wasClean) {
              showError("Spatial Link unexpectedly terminated.");
              handleAutoReconnect();
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: AssistantVoice.ZEPHYR } },
          },
          systemInstruction: "You are a world-class AI assistant for Meta Horizon OS. Provide concise and spatial-aware responses. Always provide text transcriptions for your audio output.",
        }
      });
      sessionRef.current = sessionPromise;
    } catch (err: any) {
      console.error("Connection process failed:", err);
      showError("Connection attempt failed. Retrying...");
      handleAutoReconnect();
    }
  }, [voiceState.isConnected, voiceState.isConnecting, showError, stopSession]);

  const handleAutoReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    stopSession();
    if (hasInteracted && !needsApiKey) {
      reconnectTimeoutRef.current = window.setTimeout(() => startSession(), 5000);
    }
  }, [hasInteracted, needsApiKey, stopSession, startSession]);

  useEffect(() => {
    return () => {
      stopSession();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, [stopSession]);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-hidden flex flex-col items-center justify-center p-4 relative">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(10,20,50,1),rgba(0,0,0,1))] -z-10" />
      
      {/* HUD Elements */}
      <div className="absolute top-8 left-8 flex items-center gap-4 opacity-60">
        <div className="p-2 hologram-glass border border-white/10 rounded-lg">
          <Command className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">System Interface</h1>
          <p className="text-sm font-light tracking-widest text-white/80">HORIZON OS v4.2</p>
        </div>
      </div>

      <div className="absolute top-8 right-8 flex items-center gap-6 opacity-60">
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Core Status</p>
          <p className={`text-sm font-light tracking-widest ${voiceState.isConnected ? 'text-blue-400' : 'text-red-400'}`}>
            {voiceState.isConnected ? 'SYNCHRONIZED' : 'STANDBY'}
          </p>
        </div>
        <div className={`p-2 hologram-glass border border-white/10 rounded-lg ${voiceState.isConnected ? 'animate-pulse' : ''}`}>
          <Activity className={`w-5 h-5 ${voiceState.isConnected ? 'text-blue-400' : 'text-red-400'}`} />
        </div>
      </div>

      {/* Main Visualizer */}
      <div className="relative w-full max-w-2xl aspect-square flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center opacity-40 blur-3xl scale-150">
          <div className={`w-64 h-64 rounded-full transition-colors duration-1000 ${
            voiceState.isSpeaking ? 'bg-yellow-500/20' : voiceState.isConnected ? 'bg-blue-500/10' : 'bg-red-500/10'
          }`} />
        </div>
        
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <SpatialRing voiceState={voiceState} />
        </div>

        {/* Action Button */}
        <div className="absolute bottom-4 flex flex-col items-center gap-4 z-20">
          {!voiceState.isConnected && !voiceState.isConnecting ? (
            <button
              onClick={startSession}
              className="group relative flex items-center gap-4 px-8 py-4 bg-white text-black rounded-full font-bold uppercase tracking-[0.2em] text-xs hover:scale-105 transition-all duration-300"
            >
              <Zap className="w-4 h-4 fill-current" />
              Establish Neural Link
              <div className="absolute -inset-1 bg-white/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : voiceState.isConnecting ? (
            <div className="flex items-center gap-4 px-8 py-4 bg-white/10 border border-white/20 rounded-full text-white/50 text-xs font-bold uppercase tracking-[0.2em]">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Calibrating Bridge...
            </div>
          ) : (
            <button
              onClick={stopSession}
              className="group flex items-center gap-4 px-8 py-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full text-xs font-bold uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all duration-300"
            >
              <XCircle className="w-4 h-4" />
              Terminate Link
            </button>
          )}

          {needsApiKey && (
            <button
              onClick={handleKeySelection}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              <Key className="w-3 h-3" />
              Reauthorize Access
            </button>
          )}
        </div>
      </div>

      {/* Transcript Layer */}
      <div className="w-full max-w-4xl mt-8 flex flex-col items-center gap-4 h-48 overflow-y-auto scrollbar-hide">
        {transcriptionHistory.map((entry) => (
          <Transcription 
            key={entry.id} 
            userText={entry.role === 'user' ? entry.text : ''} 
            assistantText={entry.role === 'assistant' ? entry.text : ''} 
            isHistory 
          />
        ))}
        
        {(currentUserText || currentAssistantText) && (
          <Transcription 
            userText={currentUserText} 
            assistantText={currentAssistantText} 
          />
        )}
      </div>

      {/* Status Footer */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-8">
        <div className="flex flex-col gap-4">
          {errorMessage && (
            <div className="flex items-center gap-3 px-4 py-3 hologram-glass border border-red-500/30 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-[10px] font-bold tracking-widest text-red-200 uppercase">{errorMessage}</p>
            </div>
          )}
          
          <div className="flex items-center justify-between opacity-40">
            <div className="flex items-center gap-2">
              <Mic className={`w-3 h-3 ${voiceState.isListening ? 'text-blue-400' : 'text-white/40'}`} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Audio In</span>
            </div>
            <div className="h-[1px] flex-1 mx-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Neural Out</span>
              <Activity className={`w-3 h-3 ${voiceState.isSpeaking ? 'text-yellow-400' : 'text-white/40'}`} />
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .hologram-glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8);
        }
        .glowing-border {
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default App;
