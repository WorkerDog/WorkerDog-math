
/**
 * A minimal MOBI/PDB file parser to extract text content.
 * Supports None and PalmDoc compression.
 */

export async function extractTextFromMobi(arrayBuffer: ArrayBuffer): Promise<string> {
  const view = new DataView(arrayBuffer);
  
  // 1. Read PDB Header (78 bytes)
  const numRecords = view.getUint16(76);
  
  // 2. Read Record List (8 bytes each: 4 offset, 4 attributes)
  const records = [];
  for (let i = 0; i < numRecords; i++) {
    records.push({
      offset: view.getUint32(78 + i * 8),
      attributes: view.getUint32(78 + i * 8 + 4)
    });
  }

  if (records.length === 0) return "Empty MOBI file.";

  // 3. Read PalmDoc/MOBI Header from Record 0
  const record0Offset = records[0].offset;
  const compression = view.getUint16(record0Offset);
  const totalTextLength = view.getUint32(record0Offset + 4);
  const textRecordCount = view.getUint16(record0Offset + 6);
  
  // Check identifier for MOBI
  const identifier = String.fromCharCode(
    view.getUint8(record0Offset + 16),
    view.getUint8(record0Offset + 17),
    view.getUint8(record0Offset + 18),
    view.getUint8(record0Offset + 19)
  );

  let fullText = "";

  // 4. Extract text from records (starting from Record 1)
  const limit = Math.min(records.length - 1, textRecordCount);
  const TEXT_LIMIT = 400000; // Limit to 400k characters for stability
  
  for (let i = 1; i <= limit; i++) {
    if (fullText.length >= TEXT_LIMIT) break;

    const start = records[i].offset;
    const nextOffset = (i + 1 < records.length) ? records[i + 1].offset : arrayBuffer.byteLength;
    
    // Some MOBI files have extra data at the end of text records
    // Record 0 has information about how much extra data there is
    // But for a simple parser, we try to read the whole record
    const data = new Uint8Array(arrayBuffer.slice(start, nextOffset));
    
    try {
      if (compression === 1) { // No compression
        fullText += new TextDecoder('utf-8', { fatal: false }).decode(data);
      } else if (compression === 2) { // PalmDoc compression
        fullText += decompressPalmDoc(data);
      } else {
        return `Unsupported compression: ${compression}.`;
      }
    } catch (e) {
      console.warn("Error decoding MOBI record:", i, e);
    }
  }

  // Basic HTML tag stripping
  if (fullText.includes('<') && fullText.includes('>')) {
     const doc = new DOMParser().parseFromString(fullText, 'text/html');
     fullText = doc.body.textContent || fullText;
  }

  if (fullText.length > TEXT_LIMIT) {
    fullText = fullText.slice(0, TEXT_LIMIT) + "\n\n[...Text truncated due to size...]";
  }

  return fullText.trim() || "No text extracted from MOBI.";
}

/**
 * PalmDoc (LZ77-based) decompression algorithm.
 * Reference: http://wiki.mobileread.com/wiki/PalmDoc#Decompression_Algorithm
 */
function decompressPalmDoc(data: Uint8Array): string {
  const output: number[] = [];
  let i = 0;
  
  while (i < data.length) {
    const b = data[i++];
    
    if (b >= 0x01 && b <= 0x08) {
      // Literal: copy next 'b' bytes
      for (let j = 0; j < b && i < data.length; j++) {
        output.push(data[i++]);
      }
    } else if (b <= 0x7F) {
      // Literal character
      output.push(b);
    } else if (b >= 0xC0) {
      // Space + character
      output.push(32); // Space
      output.push(b ^ 0x80);
    } else {
      // 0x80 - 0xBF: Length-distance pair
      if (i >= data.length) break;
      const b2 = data[i++];
      const distance = (((b << 8) | b2) >> 3) & 0x07FF;
      const length = (b2 & 0x07) + 3;
      
      const start = output.length - distance;
      if (start >= 0) {
        for (let j = 0; j < length; j++) {
          output.push(output[start + j]);
        }
      }
    }
  }
  
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(output));
  } catch (e) {
    return "";
  }
}
