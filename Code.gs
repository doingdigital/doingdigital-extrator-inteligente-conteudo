
/**
 * Extrator Inteligente de Conteúdo & Arquivador v3.9
 * Workspace: dd@doingdigital.me
 * Architect: Google Cloud Principal
 */

const ROOT_FOLDER_ID = '1mbQcbUP89LnIfcQ1kRJsfKsnMmdvCThu'; 
const KEYS_PROPERTY = 'SAVED_GEMINI_KEYS';
const GH_SETTINGS_PROPERTY = 'SAVED_GH_SETTINGS';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Arquivador Inteligente - Doing Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Recupera as chaves guardadas no PropertiesService
 */
function getSavedApiKeys() {
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(KEYS_PROPERTY);
    if (!raw) return [];
    
    const keys = JSON.parse(raw);
    if (!Array.isArray(keys)) return [];

    return keys.map(k => ({ 
      id: k.id, 
      alias: k.alias || 'Sem Nome', 
      masked: maskKey(k.key) 
    }));
  } catch (e) {
    Logger.log("Erro ao recuperar chaves: " + e.message);
    return [];
  }
}

function getGitHubSettings() {
  const props = PropertiesService.getScriptProperties();
  return JSON.parse(props.getProperty(GH_SETTINGS_PROPERTY) || '{}');
}

function maskKey(key) {
  if (!key || key.length < 10) return '******';
  return key.substring(0, 5) + '...' + key.substring(key.length - 4);
}

function saveKeyInternal(alias, key) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(KEYS_PROPERTY);
  const keys = raw ? JSON.parse(raw) : [];
  
  // Evitar duplicados simples (mesma chave)
  if (keys.some(k => k.key === key)) return keys.find(k => k.key === key).id;

  const newId = Utilities.getUuid();
  keys.push({ 
    id: newId, 
    alias: alias || 'Chave ' + (keys.length + 1), 
    key: key, 
    date: new Date().toISOString() 
  });
  
  props.setProperty(KEYS_PROPERTY, JSON.stringify(keys));
  return newId;
}

/**
 * Função Principal de Processamento
 */
function processAndArchive(url, folderName, keyPayload, destination, ghPayload) {
  const logs = [];
  const log = (msg) => { logs.push(`[${new Date().toLocaleTimeString('pt-PT')}] ${msg}`); Logger.log(msg); };

  try {
    // 1. Resolver Chave Gemini
    let apiKey = '';
    if (keyPayload.mode === 'saved') {
      const keys = JSON.parse(PropertiesService.getScriptProperties().getProperty(KEYS_PROPERTY) || '[]');
      const match = keys.find(k => k.id === keyPayload.id);
      if (!match) throw new Error("Chave selecionada não encontrada. Por favor, recarregue a página.");
      apiKey = match.key;
    } else {
      if (!keyPayload.key) throw new Error("Chave API não fornecida.");
      apiKey = keyPayload.key;
      saveKeyInternal(keyPayload.alias, apiKey);
    }

    // 2. Fetch de Conteúdo
    log("A aceder ao URL de origem...");
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error("Não foi possível aceder ao URL (Erro " + response.getResponseCode() + ")");
    
    const rawHtml = response.getContentText();
    
    // 3. IA Parse via Gemini
    log("A processar conteúdo com IA Gemini...");
    const aiData = callGeminiParser(rawHtml, apiKey);
    log(`Artigo identificado: ${aiData.title}`);

    // 4. Preparar Ficheiros
    const filesToArchive = [];
    const cleanHtmlFile = `<html><body style="font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6;color:#333;"><h1>${aiData.title}</h1><p style="color:#666;font-size:0.8em">Fonte: ${url}</p><hr/>${aiData.cleanHtml}</body></html>`;
    filesToArchive.push({ name: `${folderName}.html`, content: cleanHtmlFile, isBlob: false });

    if (aiData.media && aiData.media.length > 0) {
      log(`A descarregar ${aiData.media.length} ativos multimédia...`);
      aiData.media.forEach((item, idx) => {
        try {
          const blob = UrlFetchApp.fetch(item.url).getBlob();
          const ext = blob.getContentType().split('/')[1] || 'bin';
          filesToArchive.push({ name: `media/${folderName}_asset_${idx}.${ext}`, content: blob, isBlob: true });
        } catch(e) { log(`Falha ao descarregar imagem ${idx}`); }
      });
    }

    // 5. Destino: GITHUB
    if (destination === 'GITHUB') {
      log("A realizar commit no GitHub...");
      PropertiesService.getScriptProperties().setProperty(GH_SETTINGS_PROPERTY, JSON.stringify({ repo: ghPayload.repo, branch: ghPayload.branch }));
      const commitResult = pushToGitHub(ghPayload, filesToArchive, `Archive: ${aiData.title}`);
      log("GitHub: Commit realizado.");
      return { success: true, logs, folderUrl: commitResult.url, folderName: `Commit: ${commitResult.sha.substring(0,7)}` };
    } 
    
    // 6. Destino: DRIVE
    log("A criar estrutura no Google Drive...");
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const targetFolder = rootFolder.createFolder(folderName);
    
    filesToArchive.forEach(f => {
      if (f.isBlob) {
        f.content.setName(f.name.split('/').pop());
        targetFolder.createFile(f.content);
      } else {
        targetFolder.createFile(f.name, f.content, MimeType.HTML);
      }
    });
    
    const docFile = createGoogleDoc(aiData.cleanHtml, aiData.title, targetFolder);
    targetFolder.createFile(docFile.getAs(MimeType.PDF)).setName(`${folderName}.pdf`);

    log("Google Drive: Arquivo concluído.");
    return { success: true, logs, folderUrl: targetFolder.getUrl(), folderName: targetFolder.getName() };

  } catch (error) {
    log(`ERRO: ${error.message}`);
    return { success: false, logs, error: error.message };
  }
}

function pushToGitHub(gh, files, commitMessage) {
  const baseUrl = `https://api.github.com/repos/${gh.repo}`;
  const headers = {
    'Authorization': `token ${gh.token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  const refRes = UrlFetchApp.fetch(`${baseUrl}/git/refs/heads/${gh.branch}`, { headers });
  const lastCommitSha = JSON.parse(refRes.getContentText()).object.sha;

  const commitRes = UrlFetchApp.fetch(`${baseUrl}/git/commits/${lastCommitSha}`, { headers });
  const baseTreeSha = JSON.parse(commitRes.getContentText()).tree.sha;

  const treeEntries = files.map(f => {
    const content = f.isBlob ? Utilities.base64Encode(f.content.getBytes()) : Utilities.base64Encode(Utilities.newBlob(f.content).getBytes());
    const blobRes = UrlFetchApp.fetch(`${baseUrl}/git/blobs`, {
      method: 'post',
      headers,
      payload: JSON.stringify({ content, encoding: 'base64' })
    });
    return {
      path: `${gh.path}/${f.name}`,
      mode: '100644',
      type: 'blob',
      sha: JSON.parse(blobRes.getContentText()).sha
    };
  });

  const newTreeRes = UrlFetchApp.fetch(`${baseUrl}/git/trees`, {
    method: 'post',
    headers,
    payload: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
  });
  const newTreeSha = JSON.parse(newTreeRes.getContentText()).sha;

  const newCommitRes = UrlFetchApp.fetch(`${baseUrl}/git/commits`, {
    method: 'post',
    headers,
    payload: JSON.stringify({ message: commitMessage, tree: newTreeSha, parents: [lastCommitSha] })
  });
  const newCommitSha = JSON.parse(newCommitRes.getContentText()).sha;

  UrlFetchApp.fetch(`${baseUrl}/git/refs/heads/${gh.branch}`, {
    method: 'patch',
    headers,
    payload: JSON.stringify({ sha: newCommitSha })
  });

  return { sha: newCommitSha, url: `https://github.com/${gh.repo}/commit/${newCommitSha}` };
}

function callGeminiParser(html, apiKey) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
  const prompt = "Extraia o artigo em JSON: {title: string, cleanHtml: string, media: [{url: string}]}. Preserve a língua original.";
  const payload = {
    contents: [{ parts: [{ text: prompt + "\n\nHTML:\n" + html.substring(0, 80000) }] }],
    generationConfig: { response_mime_type: "application/json" }
  };
  const res = UrlFetchApp.fetch(apiUrl, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) });
  const text = JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

function createGoogleDoc(html, title, folder) {
  const resource = { title: title, mimeType: MimeType.GOOGLE_DOCS, parents: [{ id: folder.getId() }] };
  const blob = Utilities.newBlob(`<html><body>${html}</body></html>`, MimeType.HTML);
  const file = Drive.Files.insert(resource, blob, { convert: true });
  return DriveApp.getFileById(file.id);
}
