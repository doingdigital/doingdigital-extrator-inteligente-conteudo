import JSZip from 'jszip';
import saveAs from 'file-saver';
import { jsPDF } from 'jspdf';

// Helper to download image as blob
const fetchImageBlob = async (url: string): Promise<Blob | null> => {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch (e) {
    console.warn("Falha ao descarregar imagem:", url);
    return null;
  }
};

export const createArchive = async (
  folderPath: string,
  cleanHtml: string,
  originalUrl: string,
  onProgress: (msg: string) => void
) => {
  const zip = new JSZip();
  
  // Normalize folder path
  const safePath = folderPath.replace(/\\/g, '/').replace(/^\/|\/$/g, '');
  const rootFolder = zip.folder(safePath) || zip;

  onProgress("A preparar estrutura de pastas...");

  // 1. Save HTML
  const fullHtml = `
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <title>Artigo Arquivado</title>
      <style>
        body { font-family: sans-serif; max-width: 800px; margin: 40px auto; line-height: 1.6; color: #333; }
        img { max-width: 100%; height: auto; margin: 20px 0; border-radius: 8px; }
        h1 { color: #1a73e8; }
        a { color: #1a73e8; text-decoration: none; }
        .meta { font-size: 0.9em; color: #666; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="meta">
        <p><strong>URL Original:</strong> <a href="${originalUrl}">${originalUrl}</a></p>
        <p><strong>Data de Arquivo:</strong> ${new Date().toLocaleString('pt-PT')}</p>
      </div>
      ${cleanHtml}
    </body>
    </html>
  `;
  
  rootFolder.file("artigo_limpo.html", fullHtml);
  onProgress("HTML limpo guardado.");

  // 2. Extract Images & Save to 'conteudo-{NAME}'
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');
  const images = Array.from(doc.querySelectorAll('img'));
  const mediaFolderName = `conteúdo-${safePath.split('/').pop() || 'media'}`;
  const mediaFolder = rootFolder.folder(mediaFolderName);

  if (images.length > 0 && mediaFolder) {
    onProgress(`A detetar ${images.length} imagens para arquivo profundo...`);
    
    const imagePromises = images.map(async (img, index) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('http')) {
        const blob = await fetchImageBlob(src);
        if (blob) {
          // Guess extension
          const type = blob.type.split('/')[1] || 'jpg';
          const filename = `imagem_${index + 1}.${type}`;
          mediaFolder.file(filename, blob);
        }
      }
    });
    
    await Promise.all(imagePromises);
    onProgress("Imagens multimédia descarregadas.");
  }

  // 3. Generate PDF (Simple text based approach for robustness in browser)
  onProgress("A gerar PDF...");
  const pdf = new jsPDF();
  
  // Add Header
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  pdf.text(`Arquivo Digital: ${folderPath}`, 10, 10);
  pdf.text(`Fonte: ${originalUrl.substring(0, 50)}...`, 10, 15);
  
  // Add Content (stripped of HTML tags for PDF simplicity in this demo context)
  // Note: High-fidelity HTML-to-PDF in browser often requires html2canvas which can be heavy/buggy with CORS images.
  // We will use a simplified text extraction for the PDF.
  const textContent = doc.body.innerText || "";
  const splitText = pdf.splitTextToSize(textContent, 180);
  
  pdf.setFontSize(12);
  pdf.setTextColor(0);
  
  let cursorY = 25;
  // Simple pagination loop
  for (let i = 0; i < splitText.length; i++) {
    if (cursorY > 280) {
      pdf.addPage();
      cursorY = 20;
    }
    pdf.text(splitText[i], 15, cursorY);
    cursorY += 7;
  }
  
  const pdfBlob = pdf.output('blob');
  rootFolder.file("documento_formatado.pdf", pdfBlob);
  onProgress("PDF gerado com sucesso.");

  // 4. Final Zip
  onProgress("A finalizar compressão ZIP...");
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `arquivo_${safePath.replace(/\//g, '-')}.zip`);
  onProgress("Arquivo descarregado com sucesso!");
};