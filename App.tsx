
import React, { useState, useCallback, useEffect } from 'react';
import { LogViewer } from './components/LogViewer';
import { LogEntry, ProcessingStatus, ServerResponse, SavedKey, KeyPayload, StorageDestination, GitHubPayload } from './types';
import { Bot, FolderTree, Globe, Play, ExternalLink, Key, Save, Github, HardDrive, Settings2, Loader2, RefreshCw } from 'lucide-react';

declare const google: any;

export default function App() {
  // Key Management State (Gemini)
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [newKeyAlias, setNewKeyAlias] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  // Destination State
  const [destination, setDestination] = useState<StorageDestination>('DRIVE');
  
  // GitHub Specific State
  const [ghToken, setGhToken] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');

  // Common State
  const [url, setUrl] = useState('');
  const [folderPath, setFolderPath] = useState('artigos/extracao');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>({ state: 'idle', message: '' });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      message,
      type,
      timestamp: new Date()
    }]);
  }, []);

  const refreshKeys = useCallback(() => {
    setIsLoadingKeys(true);
    const isGasEnv = typeof google !== 'undefined' && google.script && google.script.run;
    if (isGasEnv) {
      google.script.run
        .withSuccessHandler((keys: SavedKey[]) => {
          setSavedKeys(keys || []);
          setIsLoadingKeys(false);
          addLog("Chaves Gemini carregadas.", 'info');
        })
        .withFailureHandler(() => {
          setIsLoadingKeys(false);
          addLog("Erro ao carregar chaves do servidor.", 'error');
        })
        .getSavedApiKeys();
    } else {
      // Mock for local dev
      setTimeout(() => {
        setSavedKeys([
          { id: '1', alias: 'Chave Demo Principal', masked: 'AIza...3x9z' },
          { id: '2', alias: 'Backup Flash', masked: 'AIza...kL82' }
        ]);
        setIsLoadingKeys(false);
      }, 800);
    }
  }, [addLog]);

  useEffect(() => {
    refreshKeys();
    const isGasEnv = typeof google !== 'undefined' && google.script && google.script.run;
    if (isGasEnv) {
      google.script.run.withSuccessHandler((settings: any) => {
        if (settings) {
          setGhRepo(settings.repo || '');
          setGhBranch(settings.branch || 'main');
        }
      }).getGitHubSettings();
    }
  }, [refreshKeys]);

  const handleStart = () => {
    if (!url) {
      addLog("Erro: URL de origem é obrigatório.", 'error');
      return;
    }
    if (!selectedKeyId) {
      addLog("Erro: Selecione uma Chave de API Gemini.", 'error');
      return;
    }
    
    if (destination === 'GITHUB' && (!ghToken || !ghRepo)) {
      addLog("Erro: Token GitHub e Repositório são obrigatórios.", 'error');
      return;
    }

    let keyPayload: KeyPayload = selectedKeyId === 'NEW' 
      ? { mode: 'new', key: newKeyValue, alias: newKeyAlias } 
      : { mode: 'saved', id: selectedKeyId };

    const ghPayload: GitHubPayload | null = destination === 'GITHUB' ? {
      token: ghToken,
      repo: ghRepo,
      branch: ghBranch,
      path: folderPath
    } : null;

    setLogs([]);
    setResultUrl(null);
    setStatus({ state: 'processing', message: 'A arquivar...' });
    addLog(`Iniciando processo para ${destination}...`, 'info');

    const isGasEnv = typeof google !== 'undefined' && google.script && google.script.run;

    if (isGasEnv) {
      google.script.run
        .withSuccessHandler((response: ServerResponse) => {
          if (response.logs) response.logs.forEach(l => addLog(l, 'info'));
          
          if (response.success) {
            setStatus({ state: 'complete', message: 'Concluído!' });
            addLog("Operação finalizada com sucesso.", 'success');
            setResultUrl(response.folderUrl || null);
            setResultName(response.folderName || 'Ver Arquivo');
            // Se criamos uma chave nova, recarregamos a lista
            if (selectedKeyId === 'NEW') refreshKeys();
          } else {
            setStatus({ state: 'error', message: 'Erro.' });
            addLog(response.error || "Erro desconhecido no servidor", 'error');
          }
        })
        .withFailureHandler((error: Error) => {
          setStatus({ state: 'error', message: 'Falha crítica.' });
          addLog(error.message, 'error');
        })
        .processAndArchive(url, folderPath, keyPayload, destination, ghPayload);
    } else {
      addLog("[DEV] Simulação local ativa.", 'warning');
      setTimeout(() => setStatus({ state: 'complete', message: 'Simulado' }), 2000);
    }
  };

  return (
    <div className="w-full bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
      {/* Header */}
      <div className="bg-slate-900 p-8 text-white">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-500 rounded-lg">
                <Bot className="w-6 h-6" />
             </div>
             <div>
                <h1 className="text-xl font-bold tracking-tight leading-none">Arquivador Inteligente</h1>
                <p className="text-slate-400 text-xs mt-1">Doing Digital Workspace v3.9</p>
             </div>
          </div>
          <button onClick={refreshKeys} className="p-2 hover:bg-slate-800 rounded-lg transition-colors" title="Atualizar chaves">
            <RefreshCw className={`w-4 h-4 text-slate-400 ${isLoadingKeys ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

        {/* Destination Toggle */}
        <div className="flex p-1 bg-slate-800 rounded-xl">
           <button 
             onClick={() => setDestination('DRIVE')}
             className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${destination === 'DRIVE' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
           >
             <HardDrive className="w-4 h-4" />
             Google Drive
           </button>
           <button 
             onClick={() => setDestination('GITHUB')}
             className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${destination === 'GITHUB' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
           >
             <Github className="w-4 h-4" />
             GitHub
           </button>
        </div>
      </div>

      <div className="p-8 space-y-6">
        
        {/* Gemini Key Selector */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
            <span className="flex items-center gap-2"><Key className="w-3 h-3 text-amber-500" /> IA: Gemini API Key</span>
            {isLoadingKeys && <span className="text-[10px] text-indigo-500 animate-pulse">A carregar chaves...</span>}
          </label>
          
          <div className="relative">
            <select 
              value={selectedKeyId}
              disabled={isLoadingKeys}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm appearance-none disabled:bg-slate-50"
            >
              <option value="">{isLoadingKeys ? 'A procurar chaves...' : 'Selecionar uma chave guardada...'}</option>
              {savedKeys.map(k => (
                <option key={k.id} value={k.id}>{k.alias} — {k.masked}</option>
              ))}
              {!isLoadingKeys && savedKeys.length === 0 && (
                <option disabled>— Nenhuma chave guardada —</option>
              )}
              <option value="NEW" className="text-indigo-600 font-bold">+ Adicionar Nova Chave Gemini</option>
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              {isLoadingKeys ? <Loader2 className="w-4 h-4 text-slate-300 animate-spin" /> : <Settings2 className="w-4 h-4 text-slate-400" />}
            </div>
          </div>

          {selectedKeyId === 'NEW' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-1">
                <label className="text-[10px] text-indigo-400 font-bold uppercase ml-1">Alias / Nome</label>
                <input type="text" placeholder="Ex: Chave Principal" value={newKeyAlias} onChange={e => setNewKeyAlias(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-indigo-400 font-bold uppercase ml-1">Chave API (Secret)</label>
                <input type="password" placeholder="AIza..." value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 outline-none focus:border-indigo-500" />
              </div>
            </div>
          )}
        </div>

        {/* URL & Path */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Globe className="w-3 h-3 text-blue-500" /> Fonte (URL)</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://exemplo.com/artigo" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FolderTree className="w-3 h-3 text-emerald-500" /> {destination === 'GITHUB' ? 'Caminho Repositório' : 'Nome da Pasta'}</label>
            <input type="text" value={folderPath} onChange={e => setFolderPath(e.target.value)} placeholder="artigos/nome-pasta" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        {/* GitHub Config Section */}
        {destination === 'GITHUB' && (
          <div className="p-6 bg-slate-900 rounded-2xl space-y-4 border border-slate-800 animate-in zoom-in-95 duration-200 shadow-inner">
            <h3 className="text-white text-sm font-bold flex items-center gap-2">
               <Github className="w-4 h-4 text-indigo-400" /> Repositório Destino
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Repo (owner/repo)</label>
                <input type="text" value={ghRepo} onChange={e => setGhRepo(e.target.value)} placeholder="utilizador/repositorio" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Branch</label>
                <input type="text" value={ghBranch} onChange={e => setGhBranch(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm outline-none" />
              </div>
            </div>
            <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Personal Access Token (PAT)</label>
                <input type="password" value={ghToken} onChange={e => setGhToken(e.target.value)} placeholder="ghp_..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
        )}

        {/* Process Button */}
        <button 
          onClick={handleStart} 
          disabled={status.state === 'processing' || isLoadingKeys}
          className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl active:scale-95 ${status.state === 'processing' ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
        >
          {status.state === 'processing' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          {status.state === 'processing' ? 'A Processar...' : 'Arquivar Artigo Agora'}
        </button>

        {/* Success Alert */}
        {resultUrl && (
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 p-2 rounded-lg text-white"><Save className="w-4 h-4" /></div>
              <div>
                <span className="text-emerald-900 text-sm font-bold block leading-none">Arquivo Finalizado!</span>
                <span className="text-emerald-600 text-[10px]">{destination}</span>
              </div>
            </div>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm">
              {resultName} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      <div className="bg-slate-900">
        <LogViewer logs={logs} />
      </div>
    </div>
  );
}
