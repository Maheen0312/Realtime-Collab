import React, { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import LanguageSelector from './LanguageSelector';

const Editor = ({ socketRef, roomId, codeRef }) => {
  const editorRef = useRef(null);
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState('javascript');
  const iframeRef = useRef(null);

  useEffect(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.on('CODE_CHANGE', ({ code }) => {
        if (code !== null) {
          codeRef.current = code;
          if (editorRef.current) {
            editorRef.current.setValue(code);
          }
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('CODE_CHANGE');
      }
    };
  }, [socketRef, codeRef]);

  const handleChange = (value) => {
    codeRef.current = value;
    socketRef.current.emit('CODE_CHANGE', { roomId, code: value });
  };

  const getLanguageExtension = () => {
    switch (language) {
      case 'javascript':
        return javascript();
      case 'python':
        return python();
      case 'cpp':
        return cpp();
      case 'java':
        return java();
      case 'html':
      case 'css':
        return html();
      default:
        return javascript();
    }
  };

  const handleRunCode = async () => {
    const code = codeRef.current;

    if (language === "html" || language === "css") {
      const htmlContent = `
        <html>
          <head>
            <style>${language === "css" ? code : ""}</style>
          </head>
          <body>
            ${language === "html" ? code : ""}
          </body>
        </html>
      `;
      if (iframeRef.current) {
        iframeRef.current.srcdoc = htmlContent;
      }
      setOutput("✅ HTML/CSS Rendered below.");
      return;
    }

    const languageMap = {
      "javascript": 63,
      "python": 71,
      "cpp": 54,
      "java": 62,
    };

    const languageId = languageMap[language];

    if (!languageId) {
      setOutput("⚠️ Language execution not supported.");
      return;
    }

    try {
      const response = await fetch("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-RapidAPI-Key": "d6915d0f2emsha6752c36c811d2ep1adfbdjsna851c64946a5",
          "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
        },
        body: JSON.stringify({
          source_code: code,
          language_id: languageId,
        }),
      });

      const result = await response.json();
      if (result.stdout) {
        setOutput(result.stdout);
      } else if (result.stderr) {
        setOutput("Error: " + result.stderr);
      } else if (result.compile_output) {
        setOutput("Compile Error: " + result.compile_output);
      } else {
        setOutput("No output received.");
      }
    } catch (error) {
      console.error("Code execution error:", error);
      setOutput("Error running code.");
    }
  };

  const handleSaveCode = () => {
    const blob = new Blob([codeRef.current || ''], { type: 'text/plain;charset=utf-8' });
    const filename = `code-${language}.${language === 'javascript' ? 'js' : language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : language === 'java' ? 'java' : 'txt'}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="code-mirror-wrapper flex flex-col h-full">
      <LanguageSelector onLanguageChange={setLanguage} />

      <div className="flex-1">
        <CodeMirror
          value={codeRef.current || ''}
          height="100%"
          theme={oneDark}
          extensions={[getLanguageExtension()]}
          onChange={handleChange}
          ref={editorRef}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <button
          onClick={handleRunCode}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          ▶️ Run Code
        </button>
        <button
          onClick={handleSaveCode}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          💾 Save Code
        </button>
      </div>

      <div className="mt-4 p-4 bg-black rounded-lg text-green-400 overflow-auto min-h-[100px]">
        <h3 className="font-bold text-white mb-2">Output:</h3>
        <pre>{output}</pre>
      </div>

      {(language === "html" || language === "css") && (
        <div className="mt-4 p-4 bg-white rounded-lg">
          <h3 className="font-bold text-black mb-2">Preview:</h3>
          <iframe
            ref={iframeRef}
            title="Live Preview"
            className="w-full h-64 border border-gray-300 rounded-md"
          />
        </div>
      )}
    </div>
  );
};

export default Editor;
