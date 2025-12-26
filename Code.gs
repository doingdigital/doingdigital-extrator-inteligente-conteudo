/**
 * Extrator Inteligente de Conteúdo & Arquivador v3.6
 * Workspace: dd@doingdigital.me
 * Architect: Google Cloud Principal
 * 
 * NOTA DE DEPLOY: Ao atualizar este ficheiro, deve criar uma "Nova Implementação" 
 * para garantir que o ROOT_FOLDER_ID atualizado entra em vigor.
 */

// CONFIGURAÇÃO CENTRAL - Atualizado conforme pedido do utilizador
const ROOT_FOLDER_ID = '1hUA3CIu34eSHGof-bc98uXGD1XI74uKV'; 
const KEYS_PROPERTY = 'SAVED_GEMINI_KEYS';

/**
 * Renderiza a interface web
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Arquivador Inteligente - Doing Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Retorna chaves guardadas (mascaradas) para o frontend
 */
function getSavedApiKeys() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(KEYS_PROPERTY);
  const keys = raw ? JSON.parse(raw) : [];
  
  return keys.map(k => ({
    id: k.id,
    alias: k.alias,
    masked: maskKey(k.key)
  }));
}

/**
 * Mascara a chave API para segurança
 */
function maskKey(key) {
  if (!key || key.length < 10) return '******';
  return key.substring(0, 5) + '...' + key.substring(key.length - 4);
}

/**
 * Helper interno para guardar nova chave
 */
function saveKeyInternal(alias, key) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(KEYS_PROPERTY);
  const keys = raw ? JSON.parse(raw) : [];
  
  const newId = Utilities.getUuid();
  keys.push({
    id: newId,
    alias: alias || 'Chave Sem Nome',
    key: key,
    date: new Date().toISOString()
  });
  
  props.setProperty(KEYS_PROPERTY, JSON.stringify(keys));
  return newId;
}

/**
 * Função Principal: Orquestra todo o fluxo
 * @param {string} url URL do artigo
 * @param {string} folderName Nome da pasta
 * @param {Object} keyPayload Objeto de configuração da chave {mode, id, key, alias}
 */
function processAndArchive(url, folderName, keyPayload) {
  // Logs detalhados de debug no Console do Apps Script
  Logger.log('=== INÍCIO DO PROCESSO ===');
  Logger.log('📁 ROOT_FOLDER_ID configurado: ' + ROOT_FOLDER_ID);
  
  let rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    Logger.log('✅ ROOT FOLDER encontrada: ' + rootFolder.getName());
    Logger.log('🔗 ROOT FOLDER URL: ' + rootFolder.getUrl());
  } catch(e) {
    Logger.log('❌ ERRO ao aceder ROOT_FOLDER_ID: ' + e.message);
    throw new Error('Pasta raiz não encontrada. Verifique se o ID ' + ROOT_FOLDER_ID + ' está correto e partilhado com a conta do script.');
  }

  Logger.log('🌐 URL recebido: ' + url);
  Logger.log('📂 Nome da pasta solicitado: ' + folderName);

  const logs = [];
  const log = (msg) => {
    logs.push(`[${new Date().toLocaleTimeString('pt-PT')}] ${msg}`);
    Logger.log(msg);
  };

  try {
    if (!folderName) throw new Error("O Nome da Pasta é obrigatório.");

    // RESOLUÇÃO DA API KEY
    let apiKey = '';
    if (keyPayload && typeof keyPayload === 'object') {
       if (keyPayload.mode === 'saved') {
         const props = PropertiesService.getScriptProperties();
         const keys = JSON.parse(props.getProperty(KEYS_PROPERTY) || '[]');
         const match = keys.find(k => k.id === keyPayload.id);
         if (!match) throw new Error("Chave API selecionada não encontrada.");
         apiKey = match.key;
         log(`Usando chave guardada: ${match.alias}`);
       } else if (keyPayload.mode === 'new') {
         apiKey = keyPayload.key;
         log(`A guardar nova chave API: "${keyPayload.alias}"...`);
         saveKeyInternal(keyPayload.alias, apiKey);
       }
    }

    if (!apiKey) throw new Error("Chave de API Gemini é obrigatória.");

    // 1. CRIAÇÃO DA ESTRUTURA DE PASTAS
    log(`A verificar sub-pasta "${folderName}" em "${rootFolder.getName()}"...`);
    const existingFolders = rootFolder.getFoldersByName(folderName);
    let targetFolder;
    if (existingFolders.hasNext()) {
      targetFolder = existingFolders.next();
      log(`Pasta existente encontrada. Conteúdo será adicionado a: ${targetFolder.getUrl()}`);
    } else {
      targetFolder = rootFolder.createFolder(folderName);
      log(`Nova pasta criada com sucesso.`);
    }
    
    const mediaFolderName = `[conteúdo-extraído]`;
    const existingMedia = targetFolder.getFoldersByName(mediaFolderName);
    let mediaFolder = existingMedia.hasNext() ? existingMedia.next() : targetFolder.createFolder(mediaFolderName);

    // 2. EXTRAÇÃO GEMINI
    log("A descarregar HTML...");
    const rawHtml = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();

    log("A consultar Gemini AI...");
    const aiData = callGeminiParser(rawHtml, apiKey);
    log(`Título identificado: "${aiData.title}"`);

    // 3. MEDIA & ASSETS
    if (aiData.media && aiData.media.length > 0) {
      log(`A processar ${aiData.media.length} ativos multimédia...`);
      aiData.media.forEach((item, index) => {
        try {
          const blob = downloadBlob(item.url);
          if (blob) {
            const ext = blob.getContentType().split('/')[1] || 'bin';
            blob.setName(`asset_${index}.${ext}`);
            mediaFolder.createFile(blob);
          }
        } catch (e) { /* silent skip individual errors */ }
      });
    }

    // 4. GERAÇÃO DE FICHEIROS
    log("A gerar Google Doc...");
    const docFile = createGoogleDoc(aiData.cleanHtml, aiData.title || folderName, targetFolder);
    log(`Doc criado: ${docFile.getName()}`);

    log("A gerar PDF...");
    const pdfBlob = docFile.getAs(MimeType.PDF);
    const pdfFile = targetFolder.createFile(pdfBlob).setName(`${folderName}.pdf`);
    log(`PDF criado: ${pdfFile.getName()}`);

    log("A guardar cópia HTML...");
    targetFolder.createFile(`${folderName}.html`, aiData.cleanHtml, MimeType.HTML);

    log("=== PROCESSO FINALIZADO COM SUCESSO ===");

    return { 
      success: true, 
      logs: logs, 
      folderUrl: targetFolder.getUrl(),
      folderName: targetFolder.getName(),
      folderId: targetFolder.getId()
    };

  } catch (error) {
    log(`❌ ERRO: ${error.message}`);
    return { success: false, logs: logs, error: error.message };
  }
}

/**
 * Parser via Gemini API com limpeza de Markdown
 */
function callGeminiParser(html, apiKey) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
  const truncatedHtml = html.substring(0, 100000);

  const payload = {
    contents: [{
      parts: [{ text: "Extraia o conteúdo principal deste HTML em JSON (cleanHtml, title, media[]). Preserve a língua original.\n\nSOURCE:\n" + truncatedHtml }]
    }],
    generationConfig: { response_mime_type: "application/json" }
  };

  const response = UrlFetchApp.fetch(apiUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) throw new Error("Falha na API Gemini.");

  const json = JSON.parse(response.getContentText());
  let text = json.candidates[0].content.parts[0].text;
  
  // Limpeza de blocos de código Markdown
  text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  
  return JSON.parse(text);
}

function downloadBlob(url) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return res.getResponseCode() === 200 ? res.getBlob() : null;
  } catch (e) { return null; }
}

/**
 * Criação de Google Doc via Drive API v2 (Serviço Avançado)
 */
function createGoogleDoc(html, title, folder) {
  const fullHtml = `<html><body><h1>${title}</h1>${html}</body></html>`;
  const resource = {
    title: title,
    mimeType: MimeType.GOOGLE_DOCS,
    parents: [{ id: folder.getId() }]
  };
  const blob = Utilities.newBlob(fullHtml, MimeType.HTML);
  const file = Drive.Files.insert(resource, blob, { convert: true });
  return DriveApp.getFileById(file.id);
}