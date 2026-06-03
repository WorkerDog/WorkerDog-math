
import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Code2, Braces, Circle, CheckCircle2, FileDown, Ghost, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  isGeneratingVideo: boolean;
  onDeleteMessage: (id: string) => void;
  onResendMessage: (msg: Message) => void;
}

const MessageItem: React.FC<{
  msg: Message;
  onDeleteMessage: (id: string) => void;
  onResendMessage: (msg: Message) => void;
  copyToClipboard: (text: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}> = ({ msg, onDeleteMessage, onResendMessage, copyToClipboard, isSelected, onToggleSelect }) => {
  const [showSource, setShowSource] = useState(false);

  return (
    <div className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div className="relative group w-auto max-w-[85%] flex items-start gap-3 flex-row text-left min-w-0">
        
        {/* ACTION KNOBS - Floating control bar */}
        <div className={`absolute -top-4 ${msg.role === 'user' ? 'right-0' : 'left-0'} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-10`}>
           {/* Select Toggle Button - NEW SOURCE FOR SELECTIVE EXPORT */}
           <button 
            onClick={() => onToggleSelect(msg.id)}
            className={`w-8 h-8 rounded-full border flex items-center justify-center shadow-xl transition-all ${isSelected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`}
            title={isSelected ? "Unselect message" : "Select for export"}
           >
             {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
           </button>

           {/* Resend Button - only for user messages */}
           {msg.role === 'user' && (
             <button 
              onClick={() => onResendMessage(msg)}
              className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-slate-700 shadow-xl transition-colors"
              title="Resend message"
             >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
             </button>
           )}

           {/* Source Toggle Button - only for AI messages with potential LaTeX/Markdown */}
           {msg.role === 'assistant' && (
             <button 
              onClick={() => setShowSource(!showSource)}
              className={`w-8 h-8 rounded-full border flex items-center justify-center shadow-xl transition-all ${showSource ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`}
              title={showSource ? "Show Rendered" : "Show Source (LaTeX)"}
             >
               {showSource ? <Braces className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
             </button>
           )}

           {/* Copy Button */}
           <button 
            onClick={() => copyToClipboard(msg.content)}
            className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 shadow-xl"
            title="Copy text"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
           </button>

           {/* THE RED TRASH BIN - Physical deletion */}
           <button 
            onClick={() => onDeleteMessage(msg.id)}
            className="w-8 h-8 rounded-full bg-rose-600 border border-rose-500 flex items-center justify-center text-white hover:bg-rose-500 shadow-xl hover:scale-110 active:scale-95 transition-all"
            title="Delete from memory"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
           </button>
        </div>

        <div className={`p-4 rounded-2xl shadow-2xl transition-all border min-w-0 w-full overflow-hidden ${msg.role === 'user' ? 'message-bubble-user' : 'message-bubble-ai'} ${isSelected ? 'ring-2 ring-blue-500 border-blue-500/50 scale-[1.01]' : msg.role === 'user' ? 'border-blue-400/20' : 'border-white/5'}`}>
          <div className="flex items-center mb-3 gap-2 opacity-40">
            {isSelected && <CheckCircle2 className="h-3 w-3 text-blue-400" />}
            <span className="text-[9px] font-black tracking-widest uppercase">{msg.role === 'user' ? 'Master' : 'Gemini'}</span>
            <span className="w-1 h-1 bg-slate-500 rounded-full"></span>
            <span className="text-[9px] uppercase font-mono tracking-wider ml-auto">
              {msg.status === 'sending' ? 'Transmitting...' : msg.status === 'error' ? 'Transmission Failed' : showSource ? 'Source Mode' : ''}
            </span>
          </div>
          
          {msg.role === 'user' && msg.status === 'error' && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-rose-400 text-[11px] font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Something went wrong with this message
              </div>
              <button 
                onClick={() => onResendMessage(msg)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-rose-600/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Resend once more
              </button>
            </div>
          )}
          
          {msg.mediaItems && msg.mediaItems.length > 0 && (
            <div className="grid gap-3 mb-4 grid-cols-1">
              {msg.mediaItems.map((item, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-white/10 bg-slate-900/40 backdrop-blur-sm group/media">
                  {item.mimeType.includes('image') && item.data ? (
                    <img src={`data:${item.mimeType};base64,${item.data}`} className="w-full max-h-[400px] object-contain" alt="Attached" />
                  ) : item.url && item.mimeType.includes('video') ? (
                    <video controls className="w-full bg-black aspect-video" src={item.url} />
                  ) : (
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-200 truncate max-w-[200px]">{item.fileName}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{item.mimeType.split('/')[1]} Document</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="markdown-content text-[15px] leading-relaxed text-slate-100">
            {showSource ? (
              <pre className="p-4 rounded-xl bg-slate-950 border border-white/5 font-mono text-[13px] whitespace-pre-wrap break-words text-blue-300 overflow-x-auto">
                {msg.content}
              </pre>
            ) : (
              <Markdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
                components={{
                code({node, inline, className, children, ...props}: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <div className="relative group/code mt-4 mb-4 w-full overflow-x-auto">
                      <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" className="!bg-slate-950 !p-4 !rounded-xl !border !border-white/5 !w-full !max-w-full overflow-x-auto" {...props}>
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  ) : <code className="bg-slate-900 px-1.5 py-0.5 rounded text-blue-400 font-mono text-[13px]" {...props}>{children}</code>;
                }
              }}>{msg.content}</Markdown>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MessageList: React.FC<MessageListProps> = ({ messages, isThinking, isGeneratingVideo, onDeleteMessage, onResendMessage }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const prevMessagesCount = useRef(messages.length);

  useEffect(() => {
    const isNewMessageAdded = messages.length > prevMessagesCount.current;
    
    if (scrollRef.current && (isNewMessageAdded || isThinking || isGeneratingVideo)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    prevMessagesCount.current = messages.length;
  }, [messages, isThinking, isGeneratingVideo]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const exportSelected = () => {
    if (selectedIds.size === 0) return;

    // Filter and sort messages by timestamp
    const selectedMsgs = messages
      .filter(m => selectedIds.has(m.id))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let textContent = `--------------------------------------------------\n`;
    textContent += `SELECTED CHAT HISTORY EXPORT\n`;
    textContent += `Export Date: ${new Date().toLocaleString()}\n`;
    textContent += `Selected Messages: ${selectedIds.size}\n`;
    textContent += `--------------------------------------------------\n\n`;

    selectedMsgs.forEach((msg) => {
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
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `partial-selection-export-${dateStr}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0 w-full overflow-x-hidden">
      {/* SELECTIVE EXPORT PANEL - FIXED TO TOP RIGHT */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="absolute top-4 right-4 z-[60] flex items-center gap-2 px-3 py-1.5 bg-blue-600/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl ring-1 ring-white/20"
          >
            <div className="flex items-center gap-2 mr-1">
              <div className="flex items-center justify-center h-5 px-1.5 rounded-md bg-white/20 text-white text-[9px] font-black uppercase">
                已选 {selectedIds.size} 项
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button 
                onClick={exportSelected}
                className="p-1 px-2 rounded-lg bg-white text-blue-600 hover:bg-blue-50 transition-all active:scale-90 flex items-center gap-1.5 shadow-sm"
                title="导出选定对话为 TXT"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold">导出</span>
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="p-1 rounded-lg hover:bg-white/10 text-white transition-all active:scale-90"
                title="取消选择"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 space-y-10 scroll-smooth pb-32 overflow-x-hidden">
        {messages.length === 0 && !isThinking && !isGeneratingVideo && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-20"></div>
              <div className="relative w-24 h-24 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-slate-200">History Guard v1.2</h2>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                您的消息已本地加密存储。悬停至消息上方可使用<span className="text-rose-500 font-bold underline"> 红色垃圾桶 </span>清理空间。
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageItem 
            key={msg.id} 
            msg={msg} 
            onDeleteMessage={onDeleteMessage} 
            onResendMessage={onResendMessage}
            copyToClipboard={copyToClipboard}
            isSelected={selectedIds.has(msg.id)}
            onToggleSelect={toggleSelect}
          />
        ))}

        {(isThinking || isGeneratingVideo) && (
          <div className="flex justify-start animate-in fade-in duration-500">
            <div className="bg-slate-800/40 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex items-center gap-4">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">
                {isGeneratingVideo ? 'Synthesizing Neural Frames...' : 'Processing Request...'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageList;
