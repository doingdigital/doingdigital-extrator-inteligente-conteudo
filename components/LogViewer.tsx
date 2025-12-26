import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface Props {
  logs: LogEntry[];
}

export const LogViewer: React.FC<Props> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700 shadow-inner flex flex-col h-64">
      <div className="bg-gray-800 px-4 py-2 flex items-center gap-2 border-b border-gray-700">
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-mono text-gray-300 uppercase tracking-wider">Registo de Sistema</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm scrollbar-hide">
        {logs.length === 0 && (
          <div className="text-gray-500 italic">A aguardar início do processo...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 animate-fade-in">
            <span className="mt-0.5 shrink-0">
              {log.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {log.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
              {log.type === 'warning' && <AlertCircle className="w-4 h-4 text-yellow-500" />}
              {log.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
            </span>
            <div>
              <span className="text-gray-500 text-xs mr-2">[{log.timestamp.toLocaleTimeString()}]</span>
              <span className={`
                ${log.type === 'success' ? 'text-green-400' : ''}
                ${log.type === 'error' ? 'text-red-400' : ''}
                ${log.type === 'warning' ? 'text-yellow-400' : ''}
                ${log.type === 'info' ? 'text-gray-300' : ''}
              `}>
                {log.message}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};