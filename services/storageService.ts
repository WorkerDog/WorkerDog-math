
import { get, set, del } from 'idb-keyval';
import { Message } from '../types';

const OLD_STORAGE_KEY_V2 = 'GEMINI_STABLE_CHAT_v2';
const OLD_STORAGE_KEY_V1 = 'GEMINI_STABLE_CHAT_v1';
const DB_STORAGE_KEY = 'gemini_discovery_messages';

export const storageService = {
  /**
   * Loads messages from the best available source, performing migration if necessary.
   */
  async loadMessages(): Promise<Message[]> {
    try {
      // 1. Try IndexedDB first (the new primary storage)
      const idbData = await get<Message[]>(DB_STORAGE_KEY);
      if (idbData && Array.isArray(idbData)) {
        return idbData.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
      }

      // 2. Fallback to LocalStorage (Migration path)
      const v2Data = localStorage.getItem(OLD_STORAGE_KEY_V2);
      if (v2Data) {
        const parsed = JSON.parse(v2Data);
        if (Array.isArray(parsed)) {
          const messages = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
          // Migrate to IDB
          await this.saveMessages(messages);
          // Optional: clear localStorage to prevent duplicates/confusion later
          // localStorage.removeItem(OLD_STORAGE_KEY_V2); 
          return messages;
        }
      }

      // 3. Last ditch check for an even older key
      const v1Data = localStorage.getItem(OLD_STORAGE_KEY_V1);
      if (v1Data) {
        const parsed = JSON.parse(v1Data);
        if (Array.isArray(parsed)) {
          const messages = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
          await this.saveMessages(messages);
          return messages;
        }
      }
    } catch (e) {
      console.error("Storage load failed", e);
    }
    return [];
  },

  async saveMessages(messages: Message[]): Promise<void> {
    try {
      await set(DB_STORAGE_KEY, messages);
      
      // Also keep a lightweight backup in localStorage (just text, no media if possible)
      // to avoid QuotaExceeded but ensure *some* persistence if IDB fails.
      const lightweight = messages.map(m => ({
        ...m,
        mediaItems: m.mediaItems?.map(mi => ({ ...mi, data: undefined })) // Strip base64
      }));
      localStorage.setItem(OLD_STORAGE_KEY_V2, JSON.stringify(lightweight));
    } catch (e) {
      console.error("Storage save failed", e);
      throw e;
    }
  },

  async clearAll(): Promise<void> {
    try {
      await del(DB_STORAGE_KEY);
      
      // Aggressive localStorage wipe for any legacy keys
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('GEMINI_')) {
          localStorage.removeItem(key);
        }
      });
      
      localStorage.removeItem(OLD_STORAGE_KEY_V2);
      localStorage.removeItem(OLD_STORAGE_KEY_V1);
      
      console.log("Full storage wipe completed.");
    } catch (e) {
      console.error("Storage wipe failed", e);
      throw e;
    }
  },

  async requestPersistence(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log(`Storage persistence ${isPersisted ? 'granted' : 'denied'}`);
      return isPersisted;
    }
    return false;
  }
};
