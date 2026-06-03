
import React, { useState, FormEvent, useRef, forwardRef, useImperativeHandle, ClipboardEvent } from 'react';
import { MessageMedia } from '../types';
import { FileText, X, Paperclip, MessageSquare, Video, Send, Image as ImageIcon, AlertCircle } from 'lucide-react';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { extractTextFromMobi } from '../lib/mobiParser';

interface ChatInputProps {
  onSendMessage: (message: string, media?: MessageMedia[]) => void;
  onGenerateVideo: (prompt: string) => void;
  disabled: boolean;
}

const ChatInput = forwardRef((props: ChatInputProps, ref) => {
  const { onSendMessage, onGenerateVideo, disabled } = props;
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'chat' | 'video'>('chat');
  const [previews, setPreviews] = useState<(MessageMedia & { id: string; name: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    addFiles: (files: FileList | File[]) => {
      processFiles(files);
    },
    setInput: (text: string) => {
      setInput(text);
    }
  }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() && previews.length === 0) return;

    if (mode === 'video') {
      onGenerateVideo(input.trim());
      setInput('');
    } else {
      onSendMessage(input.trim(), previews.length > 0 ? previews : undefined);
      setInput('');
      setPreviews([]);
    }
  };

  const convertImageToPng = (file: File): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          resolve({
            base64: dataUrl.split(',')[1],
            mimeType: 'image/png'
          });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const extractLegacyDocText = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let text = "";
    
    // Legacy .doc (OLE2) stores text in different streams.
    // We'll use a robust approach to extract both 8-bit and 16-bit printable strings.
    
    // 1. Extract UTF-8/ASCII printable sequences
    let current = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || (b >= 160 && b <= 255) || b === 10 || b === 13 || b === 9) {
        current += String.fromCharCode(b);
      } else {
        if (current.length > 5) text += current + "\n";
        current = "";
      }
    }
    if (current.length > 5) text += current + "\n";

    // 2. Extract UTF-16 (little-endian) strings - very common in Word
    let utf16Text = "";
    for (let i = 0; i < bytes.length - 1; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      // Basic check for readable chars + common punctuations + Chinese range
      if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 32 && code <= 126) || code === 10 || code === 13) {
        utf16Text += String.fromCharCode(code);
      } else {
        if (utf16Text.length > 5 && !utf16Text.endsWith("\n")) utf16Text += "\n";
      }
    }

    // Combine and clean up noise (binary fragments)
    const combined = (text + "\n" + utf16Text)
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Simple heuristic: a real line should have more than just a few random characters
        // and not look like a bunch of binary control codes
        return line.length > 6 && !/^[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/~`0-9-]+$/.test(line);
      })
      .join('\n')
      .replace(/\n\s*\n/g, '\n'); // remove excessive whitespace

    return combined.trim() || "Could not extract readable text from this legacy .doc file.";
  };

  const processFiles = async (files: FileList | File[]) => {
    const newFiles = Array.from(files);
    
    // Check total size
    const totalSize = newFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 25 * 1024 * 1024) { 
      setError("Total file size is too large (>25MB). Please upload smaller files.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    const nativeImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

    for (const file of newFiles) {
      const id = Math.random().toString(36).substr(2, 9);
      const fileName = file.name.toLowerCase();
      const mimeType = file.type.toLowerCase();
      
      const isWord = fileName.endsWith('.docx') || fileName.endsWith('.doc') || mimeType.includes('wordprocessingml') || mimeType.includes('msword');
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || mimeType.includes('spreadsheetml');
      const isEpub = fileName.endsWith('.epub') || mimeType === 'application/epub+zip';
      const isMobi = fileName.endsWith('.mobi') || fileName.endsWith('.azw') || mimeType.includes('mobipocket');
      const isImage = mimeType.startsWith('image/') || fileName.endsWith('.bmp') || fileName.endsWith('.tiff');
      
      try {
        // 1. Process Images
        if (isImage) {
          const actualMime = mimeType.startsWith('image/') ? mimeType : (fileName.endsWith('.bmp') ? 'image/bmp' : 'image/png');
          if (nativeImageTypes.includes(actualMime)) {
            // Natively supported by Gemini
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              setPreviews(prev => [...prev, { 
                id, 
                data: base64, 
                mimeType: actualMime, 
                name: file.name, 
                fileName: file.name 
              }]);
            };
            reader.readAsDataURL(file);
            continue;
          } else {
            // Non-native (like BMP), convert to PNG
            const { base64, mimeType: convertedMime } = await convertImageToPng(file);
            setPreviews(prev => [...prev, { 
              id, 
              data: base64, 
              mimeType: convertedMime, 
              name: file.name, 
              fileName: file.name 
            }]);
            continue;
          }
        }

        // 2. PDF, Video, Audio - Native Support
        if (file.type === 'application/pdf' || 
            file.type.startsWith('video/') || 
            file.type.startsWith('audio/')) {
          
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            setPreviews(prev => [...prev, { 
              id, 
              data: base64, 
              mimeType: file.type, 
              name: file.name, 
              fileName: file.name 
            }]);
          };
          reader.readAsDataURL(file);
          continue;
        }

        // 3. Word Documents (.docx, .doc)
        if (isWord) {
          const arrayBuffer = await file.arrayBuffer();
          try {
            // Try mammoth (docx/renamed docx)
            const result = await mammoth.extractRawText({ arrayBuffer });
            setPreviews(prev => [...prev, { 
              id, 
              mimeType: 'text/plain', 
              name: file.name, 
              fileName: file.name, 
              textContent: result.value 
            }]);
            continue;
          } catch (err) {
            // Fallback for legacy .doc (binary OLE2)
            // We extract printable strings as a simple but effective fallback for AI consumption
            const text = await extractLegacyDocText(file);
            setPreviews(prev => [...prev, { 
              id, 
              mimeType: 'text/plain', 
              name: file.name, 
              fileName: file.name, 
              textContent: text 
            }]);
            continue;
          }
        }

        // 4. Excel Spreadsheets (.xlsx, .xls)
        if (isExcel) {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);
          let fullText = "";
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            fullText += `--- Sheet: ${sheetName} ---\n${XLSX.utils.sheet_to_txt(worksheet)}\n\n`;
          });
          setPreviews(prev => [...prev, { 
            id, 
            mimeType: 'text/plain', 
            name: file.name, 
            fileName: file.name, 
            textContent: fullText 
          }]);
          continue;
        }

        // 5. EPUB E-books
        if (isEpub) {
          const zip = await JSZip.loadAsync(file);
          let epubText = "";
          const htmlFiles = Object.keys(zip.files).filter(name => 
            name.endsWith('.xhtml') || name.endsWith('.html') || name.endsWith('.htm')
          ).sort();

          for (const filename of htmlFiles) {
            const content = await zip.files[filename].async('string');
            const doc = new DOMParser().parseFromString(content, 'text/html');
            const bodyText = doc.body.textContent || "";
            if (bodyText.trim()) {
              epubText += `[Chapter: ${filename}]\n${bodyText}\n\n`;
            }
          }

          if (!epubText) epubText = "Could not extract text from EPUB.";
          
          setPreviews(prev => [...prev, { 
            id, 
            mimeType: 'text/plain', 
            name: file.name, 
            fileName: file.name, 
            textContent: epubText 
          }]);
          continue;
        }

        // 6. MOBI E-books
        if (isMobi) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const text = await extractTextFromMobi(arrayBuffer);
            setPreviews(prev => [...prev, { 
              id, 
              mimeType: 'text/plain', 
              name: file.name, 
              fileName: file.name, 
              textContent: text 
            }]);
            continue;
          } catch (mobiErr) {
            console.error("MOBI extraction failed:", mobiErr);
          }
        }

        // 7. Plain Text Files (txt, csv, md, py, js, etc.)
        const text = await file.text();
        const isBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000));
        
        if (!isBinary) {
          setPreviews(prev => [...prev, { 
            id, 
            mimeType: 'text/plain', 
            name: file.name, 
            fileName: file.name, 
            textContent: text 
          }]);
        } else {
          setError(`Unsupported format: ${file.name}`);
          setTimeout(() => setError(null), 5000);
        }

      } catch (err) {
        console.error("Error processing file:", file.name, err);
        setError(`Failed to process ${file.name}.`);
        setTimeout(() => setError(null), 5000);
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile();
      if (file) {
        files.push(file);
      }
    }

    if (files.length > 0) {
      processFiles(files);
    }
  };

  return (
    <div className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-xl relative w-full overflow-x-hidden">
      {error && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-amber-500 text-black px-4 py-2 rounded-lg text-xs font-bold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 w-full">
        {previews.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {previews.map((preview) => (
              <div key={preview.id} className="relative group flex-shrink-0">
                <div className="w-16 h-16 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shadow-inner">
                  {preview.data && preview.mimeType.startsWith('image/') ? (
                    <img src={`data:${preview.mimeType};base64,${preview.data}`} className="w-full h-full object-cover" alt="Preview" />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-1">
                      <FileText className="h-6 w-6 text-blue-400" />
                      <span className="text-[8px] text-slate-500 truncate w-12 text-center mt-1">{preview.name}</span>
                    </div>
                  )}
                </div>
                <button 
                  type="button"
                  onClick={() => setPreviews(p => p.filter(x => x.id !== preview.id))}
                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full p-0.5 shadow-lg hover:bg-rose-500 transition-colors z-10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} />
          
          <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700 h-12">
            <button 
              type="button" 
              onClick={() => setMode('chat')} 
              className={`p-2 rounded-lg transition-all ${mode === 'chat' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              title="Chat Mode"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            <button 
              type="button" 
              onClick={() => setMode('video')} 
              className={`p-2 rounded-lg transition-all ${mode === 'video' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              title="Video Generation"
            >
              <Video className="h-5 w-5" />
            </button>
          </div>

          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()} 
            className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white hover:bg-slate-700 transition-all border border-slate-700 h-12 flex items-center justify-center"
            title="Upload Files"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <div className="flex-1 relative">
            <textarea 
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              onPaste={handlePaste as any}
              placeholder={mode === 'video' ? "Describe a video..." : "Send a message or drop files..."}
              disabled={disabled}
              rows={1}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-600 transition-all min-h-[48px] max-h-32 overflow-y-auto resize-none block scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent"
            />
          </div>

          <button 
            type="submit" 
            disabled={(!input.trim() && previews.length === 0) || disabled} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 h-12 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg active:scale-95 flex items-center justify-center gap-2"
          >
            {disabled ? '...' : <><Send className="h-4 w-4" /> <span>Send</span></>}
          </button>
        </form>
      </div>
    </div>
  );
});

export default ChatInput;
