import React from 'react';

interface Props {
  html: string;
}

export const Preview: React.FC<Props> = ({ html }) => {
  if (!html) return null;

  return (
    <div className="mt-8 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Pré-visualização do Conteúdo Limpo</h3>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">Modo Leitura</span>
      </div>
      <div className="p-8 prose prose-blue max-w-none">
        {/* Dangerous HTML is safe here because we trust the Gemini Output (mostly), 
            but in prod utilize DOMPurify. For this demo, we assume Gemini follows instructions. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
};