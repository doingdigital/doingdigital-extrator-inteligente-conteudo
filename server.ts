import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";
import { google } from 'googleapis';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

const PORT = process.env.PORT || 8080;
const ROOT_FOLDER_ID = '1mbQcbUP89LnIfcQ1kRJsfKsnMmdvCThu';

// Inicialização do Google Drive Auth (Application Default Credentials)
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/documents'],
});
const drive = google.drive({ version: 'v3', auth });

app.get('/api/keys', async (req, res) => {
  // Em Cloud Run, as chaves podem ser geridas via Secret Manager ou Env Vars
  // Para manter a paridade com a UI anterior, simulamos a lista
  res.json([]);
});

app.post('/api/process', async (req, res) => {
  const { url, folderName, keyPayload } = req.body;
  const logs: string[] = [];
  const log = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-PT');
    logs.push(`[${timestamp}] ${msg}`);
    console.log(`[${timestamp}] ${msg}`);
  };

  try {
    log('=== INÍCIO DO PROCESSO (Cloud Run) ===');
    
    // 1. Resolução da Chave Gemini
    let apiKey = process.env.API_KEY; 
    if (keyPayload && keyPayload.mode === 'new') {
        apiKey = keyPayload.key;
    }
    
    if (!apiKey) throw new Error("Chave de API Gemini não configurada.");
    const ai = new GoogleGenAI({ apiKey });

    // 2. Acesso à Pasta Raiz
    log(`A verificar pasta raiz: ${ROOT_FOLDER_ID}`);
    const rootMetadata = await drive.files.get({ fileId: ROOT_FOLDER_ID, fields: 'name, webViewLink' });
    log(`Pasta raiz encontrada: ${rootMetadata.data.name}`);

    // 3. Criar Pasta de Destino
    log(`A criar/procurar pasta: ${folderName}`);
    const folderResponse = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_FOLDER_ID],
      },
      fields: 'id, webViewLink',
    });
    const targetFolderId = folderResponse.data.id!;
    const targetFolderUrl = folderResponse.data.webViewLink!;

    // 4. Download HTML
    log(`A descarregar: ${url}`);
    const htmlResponse = await fetch(url);
    const rawHtml = await htmlResponse.text();

    // 5. Extração Gemini
    log("A consultar Gemini AI...");
    const model = 'gemini-3-flash-preview';
    const systemInstruction = "Extraia o conteúdo principal deste HTML em JSON (cleanHtml, title, media[]). Preserve a língua original.";
    
    const aiResult = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: systemInstruction + "\n\nHTML:\n" + rawHtml.substring(0, 50000) }] }],
    });

    let aiText = aiResult.text || "";
    aiText = aiText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const aiData = JSON.parse(aiText);
    log(`Título extraído: ${aiData.title}`);

    // 6. Criar Google Doc
    log("A gerar Google Doc...");
    const fullDocHtml = `<html><body><h1>${aiData.title}</h1>${aiData.cleanHtml}</body></html>`;
    const docResponse = await drive.files.create({
      requestBody: {
        name: `${aiData.title || folderName}`,
        mimeType: 'application/vnd.google-apps.document',
        parents: [targetFolderId],
      },
      media: {
        mimeType: 'text/html',
        body: fullDocHtml,
      },
      fields: 'id',
    });

    // 7. Criar Ficheiro HTML de Backup
    await drive.files.create({
      requestBody: {
        name: `${folderName}.html`,
        mimeType: 'text/html',
        parents: [targetFolderId],
      },
      media: {
        mimeType: 'text/html',
        body: aiData.cleanHtml,
      },
    });

    log("=== PROCESSO FINALIZADO ===");
    res.json({
      success: true,
      logs,
      folderUrl: targetFolderUrl,
      folderName: folderName,
      folderId: targetFolderId
    });

  } catch (error: any) {
    log(`ERRO: ${error.message}`);
    res.status(500).json({ success: false, logs, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});