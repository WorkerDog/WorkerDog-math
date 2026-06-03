
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Message, ChatState, MessageMedia } from './types';
import { sendMessageStreamWithMedia, generateVideo } from './services/geminiService';
import { storageService } from './services/storageService';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import { Download, Trash2, ShieldCheck, Database, HardDrive, ExternalLink, Upload, AlertCircle, X, Check, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import 'katex/dist/katex.min.css';

const MAX_SYMBOLIC_CAPACITY = 500 * 1024 * 1024; // 500MB as a generous symbolic limit

const App: React.FC = () => {
  const [state, setState] = useState<ChatState>({ 
    messages: [], 
    isThinking: false, 
    isGeneratingVideo: false, 
    error: null 
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const chatInputRef = useRef<any>(null);

  // Initialize storage and request persistence
  useEffect(() => {
    const init = async () => {
      await storageService.requestPersistence();
      const savedMessages = await storageService.loadMessages();
      setState(prev => ({ ...prev, messages: savedMessages }));
      setIsInitialized(true);
    };
    init();
  }, []);

  // Sync with IndexedDB whenever messages change
  useEffect(() => {
    if (!isInitialized) return;
    
    const save = async () => {
      try {
        await storageService.saveMessages(state.messages);
      } catch (e) {
        setState(prev => ({ ...prev, error: "Storage Error! Your device might be out of space." }));
      }
    };
    save();
  }, [state.messages, isInitialized]);

  const storageUsagePercent = useMemo(() => {
    try {
      const str = JSON.stringify(state.messages);
      const bytes = new Blob([str]).size;
      return Math.min(100, Math.round((bytes / MAX_SYMBOLIC_CAPACITY) * 100));
    } catch (e) { return 0; }
  }, [state.messages]);

  const handleSendMessage = useCallback(async (content: string, mediaItems?: MessageMedia[]) => {
    if (state.isThinking) return;

    const userMsg: Message = { 
      id: `u-${Date.now()}`, 
      role: 'user', 
      content, 
      timestamp: new Date(), 
      mediaItems,
      status: 'sending'
    };

    // Placeholder for assistant message to be filled by streaming
    const assistantMsg: Message = { 
      id: `a-${Date.now()}`, 
      role: 'assistant', 
      content: '', 
      timestamp: new Date() 
    };

    setState(prev => ({ 
      ...prev, 
      messages: [...prev.messages, userMsg, assistantMsg], 
      isThinking: true,
      error: null 
    }));

    try {
      const historySnapshot = [...state.messages, userMsg];
      
      let fullText = "";
      await sendMessageStreamWithMedia(
        historySnapshot, 
        content, 
        mediaItems,
        (chunk) => {
          fullText += chunk;
          setState(prev => ({
            ...prev,
            messages: prev.messages.map(m => 
              m.id === assistantMsg.id ? { ...m, content: fullText } : m
            ),
            isThinking: false
          }));
        }
      );
      
      setState(prev => ({ 
        ...prev, 
        messages: prev.messages.map(m => {
          if (m.id === userMsg.id) return { ...m, status: 'sent' as const };
          return m;
        }), 
        isThinking: false 
      }));
    } catch (err: any) {
      console.error("AI Error:", err);
      // Update message status to error
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m => m.id === userMsg.id ? { ...m, status: 'error' as const } : m)
      }));

      // Extra check for the generic proxy error to give better advice
      const msg = err.message || "";
      let userError = "Connection failed. Please check your network or try again.";
      
      if (msg.toLowerCase().includes("api key")) {
        userError = "API Key error. Please verify your environment configuration.";
      } else if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("429")) {
        userError = "Rate limit exceeded. Please wait a moment before trying again.";
      } else if (msg.toLowerCase().includes("proxy") || msg.toLowerCase().includes("failed to fetch")) {
        userError = "The AI service is currently unavailable or the request was too large.";
      } else if (msg) {
        userError = `API Error: ${msg}`;
      }

      setState(prev => ({ 
        ...prev, 
        isThinking: false, 
        error: userError 
      }));
      setTimeout(() => setState(p => ({ ...p, error: null })), 8000);
    }
  }, [state.isThinking, state.messages]);

  const handleGenerateVideo = useCallback(async (prompt: string) => {
    if (state.isGeneratingVideo) return;

    const userMsg: Message = { 
      id: `u-v-${Date.now()}`, 
      role: 'user', 
      content: `🎥 Video Request: ${prompt}`, 
      timestamp: new Date(),
      status: 'sending'
    };
    
    setState(prev => ({ ...prev, messages: [...prev.messages, userMsg], isGeneratingVideo: true }));

    try {
      const url = await generateVideo(prompt);
      const assistantMsg: Message = { 
        id: `a-v-${Date.now()}`, 
        role: 'assistant', 
        content: 'I have generated the video for you:', 
        timestamp: new Date(), 
        mediaItems: [{ url, mimeType: 'video/mp4' }] 
      };
      setState(prev => ({ 
        ...prev, 
        messages: prev.messages.map(m => m.id === userMsg.id ? { ...m, status: 'sent' as const } : m).concat(assistantMsg), 
        isGeneratingVideo: false 
      }));
    } catch (err: any) {
      setState(prev => ({ 
        ...prev, 
        messages: prev.messages.map(m => m.id === userMsg.id ? { ...m, status: 'error' as const } : m),
        isGeneratingVideo: false, 
        error: "Video generation failed." 
      }));
    }
  }, [state.isGeneratingVideo, state.messages]);

  const handleResendMessage = useCallback(async (msg: Message) => {
    if (state.isThinking || state.isGeneratingVideo) return;

    // Remove the failed message and its following messages (if any, though usually none)
    const msgIndex = state.messages.findIndex(m => m.id === msg.id);
    if (msgIndex === -1) return;

    // We either remove it and resend, or just resend.
    // The user said "re-send once more", which usually implies trying again.
    // I'll filter out the old one to keep the conversation clean.
    const newMessages = state.messages.filter(m => m.id !== msg.id);
    setState(prev => ({ ...prev, messages: newMessages }));

    if (msg.content.startsWith('🎥 Video Request: ')) {
      const prompt = msg.content.replace('🎥 Video Request: ', '');
      handleGenerateVideo(prompt);
    } else {
      handleSendMessage(msg.content, msg.mediaItems);
    }
  }, [state.messages, handleSendMessage, handleGenerateVideo, state.isThinking, state.isGeneratingVideo]);

  const deleteMessage = (id: string) => {
    setState(prev => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== id)
    }));
  };

  const handleClearHistory = async () => {
    try {
      // 1. Clear memory state immediately for UI responsiveness
      setState(prev => ({ ...prev, messages: [], error: "Wiping history..." }));
      
      // 2. Clear physical storage
      await storageService.clearAll();
      
      // 3. Clear confirm state
      setShowClearConfirm(false);

      // 4. Show success message
      setState(prev => ({ ...prev, error: "History wiped and storage freed." }));
      setTimeout(() => setState(p => ({ ...p, error: null })), 3000);
    } catch (err) {
      console.error("Clear failed", err);
      setState(prev => ({ ...prev, error: "Failed to clear physical storage." }));
      setShowClearConfirm(false);
    }
  };

  const downloadBackup = () => {
    let textContent = `--------------------------------------------------\n`;
    textContent += `GEMINI AI CHAT HISTORY BACKUP\n`;
    textContent += `Export Date: ${new Date().toLocaleString()}\n`;
    textContent += `--------------------------------------------------\n\n`;

    state.messages.forEach((msg) => {
      const time = msg.timestamp.toLocaleString();
      const role = msg.role === 'user' ? 'USER' : 'GEMINI';
      textContent += `[${time}] ${role}:\n`;
      textContent += `${msg.content}\n`;
      
      if (msg.mediaItems && msg.mediaItems.length > 0) {
        msg.mediaItems.forEach(item => {
          textContent += `>> [Attachment: ${item.fileName || 'Media Content'} (${item.mimeType})]\n`;
        });
      }
      
      textContent += `\n${'-'.repeat(30)}\n\n`;
    });

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-chat-history-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const messages = JSON.parse(event.target?.result as string);
        if (Array.isArray(messages)) {
          const restored = messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
          setState(prev => ({ ...prev, messages: restored }));
          alert('History restored successfully!');
        }
      } catch (err) {
        alert('Failed to import backup. Invalid file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200">
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-xl shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
             <Database className="h-6 w-6 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-[10px] font-black tracking-[0.2em] text-white leading-none text-left">GEMINI FLASH LATEST</h1>
            <div className="flex items-center gap-1 mt-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-tighter">Encrypted Local Vault</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 lg:gap-8">
          <div className="hidden lg:flex flex-col items-end">
             <div className="flex items-center gap-2 mb-1">
                <HardDrive className="h-3 w-3 text-slate-500" />
                <span className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Enhanced Persistence</span>
             </div>
             <div className="flex items-center gap-3">
                <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div 
                    className={`h-full transition-all duration-700 ${storageUsagePercent > 85 ? 'bg-rose-500 animate-pulse' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'}`}
                    style={{ width: `${storageUsagePercent}%` }}
                  ></div>
                </div>
                <span className={`text-[10px] font-mono font-bold ${storageUsagePercent > 85 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {storageUsagePercent}%
                </span>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={downloadBackup}
              className="p-2.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all border border-slate-700/50"
              title="Download TXT History"
            >
              <FileText className="h-4 w-4" />
            </button>
            
            <label className="p-2.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all border border-slate-700/50 cursor-pointer" title="Restore from Backup">
              <Upload className="h-4 w-4" />
              <input type="file" accept=".json" onChange={importBackup} className="hidden" />
            </label>

            <button 
              onClick={() => setShowClearConfirm(true)}
              className="p-2.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all border border-slate-700/50"
              title="Wipe Session"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="hidden md:flex p-2.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-all border border-slate-700/50"
              title="Open in New Tab (More Persistent)"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <MessageList 
        messages={state.messages} 
        isThinking={state.isThinking} 
        isGeneratingVideo={state.isGeneratingVideo}
        onDeleteMessage={deleteMessage}
        onResendMessage={handleResendMessage}
      />

      <ChatInput 
        ref={chatInputRef}
        onSendMessage={handleSendMessage} 
        onGenerateVideo={handleGenerateVideo}
        disabled={state.isThinking || state.isGeneratingVideo} 
      />

      {state.error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-rose-600/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl text-xs font-bold animate-in slide-in-from-bottom-4 border border-rose-500">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {state.error}
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              {/* Background Accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl -mr-16 -mt-16 pointer-events-none" />
              
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-6">
                  <Trash2 className="h-8 w-8 text-rose-500" />
                </div>
                
                <h3 className="text-xl font-bold text-white mb-2">Wipe Chat History?</h3>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                  This action is irreversible. All local messages, media, and cached AI responses will be permanently deleted from this device.
                </p>
                
                <div className="flex flex-col w-full gap-3">
                  <button 
                    onClick={handleClearHistory}
                    className="flex items-center justify-center gap-2 w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-rose-600/20 active:scale-95"
                  >
                    <Check className="h-4 w-4" />
                    Confirm Wipe
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="flex items-center justify-center gap-2 w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold transition-all active:scale-95"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
