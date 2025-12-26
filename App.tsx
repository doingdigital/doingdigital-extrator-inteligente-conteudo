import React, { useState, useCallback, useEffect } from 'react';
import { LogViewer } from './components/LogViewer';
import { LogEntry, ProcessingStatus, ServerResponse, SavedKey, KeyPayload } from './types';
import { Bot, FolderTree, Globe, Play, ExternalLink, Key, Plus, Save } from 'lucide-react';

export default function App() {
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [newKeyAlias, setNewKeyAlias] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [url, setUrl] = useState('');
  const [folderPath, setFolderPath] = useState('Clientes/Geral');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>({ state: 'idle', message: '' });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFolderName, setResultFolderName] = useState<string | null>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      message,
      type,
      timestamp: new Date()
    }]);
  }, []);

  useEffect(() => {
    fetch('/api/keys')
      .then(res => res.json())
      .then(keys => setSavedKeys(keys))
      .catch(err => addLog("Erro ao carregar chaves: " + err.message, 'error'));
  }, [addLog]);

  const handleStart = async () => {
    if (!url) {
      addLog("Erro: URL é obrigatório.", 'error');
      return;
    }

    let keyPayload: KeyPayload;
    if (selectedKeyId === 'NEW') {
      keyPayload = { mode: 'new', key: newKeyValue, alias: newKeyAlias };
    } else {
      keyPayload = { mode: 'saved', id: selectedKeyId };
    }

    setLogs([]);
    setResultUrl(null);
    setStatus({ state: 'processing', message: 'A processar no servidor...' });
    addLog("A enviar pedido ao Cloud Run...", 'info');

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, folderName: folderPath, keyPayload })
      });

      const data: ServerResponse = await response.json();

      if (data.logs) {
        data.logs.forEach(msg => addLog(msg, 'info'));
      }

      if (data.success) {
        setStatus({ state: 'complete', message: 'Sucesso!' });
        setResultUrl(data.folderUrl || null);
        setResultFolderName(data.folderName || null);
        addLog("Concluído com sucesso!", 'success');
      } else {
        throw new Error(data.error || "Erro no servidor");
      }
    } catch (err: any) {
      setStatus({ state: 'error', message: 'Erro no processo.' });
      addLog(err.message, 'error');
    }
  };

  return (
    <div className="w-full bg-white rounded-xl material-shadow overflow-hidden">
      <div className="bg-indigo-600 p-6 text-white text-center">
        <div className="inline-flex items-center justify-center p-2 bg-indigo-500 rounded-full mb-3">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Arquivador Inteligente</h1>
        <p className="text-indigo-200 text-sm mt-1">Doing Digital Workspace • Cloud Run Edition</p>
      </div>

      <div className="p-8 space-y-6">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-500" />
            Chave de API Gemini
          </label>
          <select 
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-white mb-2"
          >
            <option value="">Selecione uma chave...</option>
            {savedKeys.map(k => <option key={k.id} value={k.id}>{k.alias}</option>)}
            <option value="NEW">+ Adicionar Nova Chave</option>
          </select>

          {selectedKeyId === 'NEW' && (
             <div className="space-y-3 mt-4">
                <input 
                  type="text" value={newKeyAlias} onChange={e => setNewKeyAlias(e.target.value)}
                  placeholder="Nome da Chave" className="w-full px-3 py-2 border rounded text-sm"
                />
                <input 
                  type="password" value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)}
                  placeholder="Chave API" className="w-full px-3 py-2 border rounded text-sm"
                />
             </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" /> URL do Artigo
            </label>
            <input 
              type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://..." className="w-full px-4 py-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-emerald-500" /> Nome da Pasta
            </label>
            <input 
              type="text" value={folderPath} onChange={e => setFolderPath(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg"
            />
          </div>
        </div>

        <button 
          onClick={handleStart} disabled={status.state === 'processing'}
          className="w-full flex justify-center items-center gap-3 font-bold py-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {status.state === 'processing' ? <div className="spinner"></div> : <Play className="w-5 h-5" />}
          <span>{status.state === 'processing' ? 'A Processar...' : 'Processar e Arquivar'}</span>
        </button>
        
        {resultUrl && (
           <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="font-medium text-green-800">Sucesso!</p>
              <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-green-700 font-bold flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" /> Abrir Pasta: {resultFolderName}
              </a>
           </div>
        )}
      </div>

      <LogViewer logs={logs} />
    </div>
  );
}