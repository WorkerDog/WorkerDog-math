
import { GoogleGenAI, Modality } from "@google/genai";
import { Message, MessageMedia } from "../types";

const SUPPORTED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
  'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'
];

const isSupportedMimeType = (mime: string) => {
  return SUPPORTED_MIME_TYPES.includes(mime);
};

const mapToContent = (messages: Message[]) => {
  return messages.map(msg => {
    const parts: any[] = [];
    let combinedText = msg.content || "";
    
    if (msg.mediaItems) {
      msg.mediaItems.forEach(item => {
        if (item.textContent) combinedText += `\n\n[File Content: ${item.fileName}]\n${item.textContent}\n`;
      });
    }
    
    if (combinedText.trim()) parts.push({ text: combinedText });
    
    if (msg.mediaItems) {
      msg.mediaItems.forEach(item => {
        if (item.data && isSupportedMimeType(item.mimeType)) {
          parts.push({ inlineData: { data: item.data, mimeType: item.mimeType } });
        }
      });
    }
    
    if (parts.length === 0) parts.push({ text: "..." });
    return { role: msg.role === 'user' ? 'user' : 'model', parts };
  });
};

export const sendMessageWithMedia = async (
  fullHistory: Message[],
  currentText: string,
  mediaItems?: MessageMedia[]
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const currentParts: any[] = [];
  let prompt = currentText;

  // Add a defensive check for the API Key
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in the environment.');
  }

  if (mediaItems) {
    mediaItems.forEach(item => {
      if (item.textContent) prompt += `\n\n[File Content: ${item.fileName}]\n${item.textContent}`;
      if (item.data && isSupportedMimeType(item.mimeType)) {
        currentParts.push({ inlineData: { data: item.data, mimeType: item.mimeType } });
      }
    });
  }
  
  currentParts.unshift({ text: prompt || "Analyze this content." });

  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [
      ...mapToContent(fullHistory.slice(0, -1)),
      { role: 'user', parts: currentParts }
    ],
    config: {
      systemInstruction: "你是一个博学、专业、亲切的AI助手。你的主人是一位数学专业的硕士研究生，因此你在对话中应保持专业性和严谨性，同时使用中文（简体）进行交流。对于用户上传的文件，请进行深入分析并给出有价值的见解。",
    },
  });

  return response.text || "";
};

export const sendMessageStreamWithMedia = async (
  fullHistory: Message[],
  currentText: string,
  mediaItems?: MessageMedia[],
  onChunk?: (chunk: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const currentParts: any[] = [];
  let prompt = currentText;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined.');
  }

  if (mediaItems) {
    mediaItems.forEach(item => {
      if (item.textContent) prompt += `\n\n[File Content: ${item.fileName}]\n${item.textContent}`;
      if (item.data && isSupportedMimeType(item.mimeType)) {
        currentParts.push({ inlineData: { data: item.data, mimeType: item.mimeType } });
      }
    });
  }
  
  currentParts.unshift({ text: prompt || "Analyze this content." });

  const stream = await ai.models.generateContentStream({
    model: 'gemini-flash-latest',
    contents: [
      ...mapToContent(fullHistory.slice(0, -1)),
      { role: 'user', parts: currentParts }
    ],
    config: {
      systemInstruction: "你是一个博学、专业、亲切的AI助手。你的主人是一位数学专业的硕士研究生，因此你在对话中应保持专业性和严谨性，同时使用中文（简体）进行交流。对于用户上传的文件，请进行深入分析并给出有价值的见解。",
    },
  });

  let fullText = "";
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      fullText += text;
      if (onChunk) onChunk(text);
    }
  }

  return fullText;
};

export const generateVideo = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
  });
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }
  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video link not found.");
  const response = await fetch(`${downloadLink}&key=${process.env.GEMINI_API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
