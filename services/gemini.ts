import { GoogleGenAI } from "@google/genai";

export const cleanContentWithGemini = async (
  rawHtml: string
): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("Chave API Gemini em falta.");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const systemPrompt = `
    You are a strict content extractor. Analyze the provided HTML/Text.
    
    1. Remove all advertisements, popups, sidebars, sponsored links, and navigation menus. 
    2. Return ONLY the main article content formatted as clean, semantic HTML (<h1>, <p>, <ul>, etc.). 
    3. **LANGUAGE PRESERVATION POLICY:** You must STRICTLY preserve the original language of the source text. Do NOT translate. If the source is in English, keep it in English. If it is in Spanish, keep it in Spanish.
    4. Do not summarize; keep the full original text.
    
    Technical Constraints:
    - Maintain valid <img> tags with original 'src' attributes.
    - Remove dangerous HTML (scripts, iframes, tracking pixels).
    - Do not include <html>, <head>, or <body> tags. Return only the inner body content.
  `;

  try {
    // We use gemini-3-flash-preview as it is efficient for large context text processing
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: rawHtml.substring(0, 100000), // Limit characters to avoid token limits if HTML is massive
      config: {
        systemInstruction: systemPrompt,
      }
    });

    const text = response.text;
    if (!text) throw new Error("Não foi gerada resposta pelo Gemini.");
    
    // Cleanup markdown code blocks if Gemini wraps the output
    return text.replace(/^```html\s*/i, '').replace(/\s*```$/, '');
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Falha ao processar conteúdo com Gemini: " + (error instanceof Error ? error.message : String(error)));
  }
};