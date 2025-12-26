/**
 * Fetches HTML from a URL using a CORS proxy to bypass browser restrictions.
 * Note: In a production environment, this should be your own backend.
 * Using a public proxy for demonstration purposes.
 */
export const fetchUrlContent = async (url: string): Promise<string> => {
  try {
    // Validating URL
    new URL(url); 
    
    // Using a reliable CORS proxy service for demo purposes
    // Alternative: 'https://api.allorigins.win/raw?url='
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    
    const text = await response.text();
    if (!text || text.length < 50) {
      throw new Error("O conteúdo recuperado parece estar vazio ou inválido.");
    }

    return text;
  } catch (error) {
    throw new Error(`Falha ao descarregar URL: ${error instanceof Error ? error.message : String(error)}`);
  }
};