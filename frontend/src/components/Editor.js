import React, { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import LanguageSelector from './LanguageSelector';

// Enhanced syntax highlighting
const myHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#cc99ff" },
  { tag: tags.function(tags.variableName), color: "#61afef" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.comment, color: "#7f848e", fontStyle: "italic" },
  { tag: tags.number, color: "#d19a66" },
  { tag: tags.propertyName, color: "#e06c75" },
  { tag: tags.punctuation, color: "#abb2bf" },
]);

// Custom CodeMirror theme extensions
const customTheme = EditorView.theme({
  '&': {
    fontSize: '15px',
    borderRadius: '8px',
    overflow: 'hidden',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'JetBrains Mono, monospace',
    lineHeight: '1.6',
    paddingTop: '8px',
  },
  '.cm-gutters': {
    backgroundColor: '#21252b',
    border: 'none',
    borderRight: '1px solid #333842',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2c313c',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(44, 49, 60, 0.5)',
  },
  '.cm-cursor': {
    borderLeftColor: '#f8f8f0',
  },
});

const Editor = ({ socketRef, roomId, codeRef }) => {
  const editorRef = useRef(null);
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState('javascript');
  
  // Function to update language and notify others
  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    // Emit language change to other users
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: newLanguage });
    }
  };
  const iframeRef = useRef(null);
  const [outputHistory, setOutputHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [cursorBlink, setCursorBlink] = useState(true);

  // Enhanced connection handling
  // Import ACTIONS from somewhere in your project
  // If you don't have access to it directly, define actions that match your server
  const ACTIONS = {
    JOIN: 'join',
    JOINED: 'joined',
    CODE_CHANGE: 'code-change',
    SYNC_CODE: 'sync-code',
    DISCONNECTED: 'disconnected',
    LANGUAGE_CHANGE: 'language-change',
  };
  
  useEffect(() => {
    const socket = socketRef.current;
    if (socket) {
      // Setup connection status
      socket.on('connect', () => {
        setIsConnected(true);
        // Join the code editor room with username (you might need to get this from props or context)
        const username = localStorage.getItem('username') || 'User-' + Math.floor(Math.random() * 1000);
        socket.emit(ACTIONS.JOIN, { roomId, username });
      });
      
      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      // Handle code changes from other users
      socket.on(ACTIONS.CODE_CHANGE, ({ code }) => {
        if (code !== null && code !== codeRef.current) {
          codeRef.current = code;
          if (editorRef.current) {
            editorRef.current.setValue(code);
          }
        }
      });
      
      // Handle language changes
      socket.on(ACTIONS.LANGUAGE_CHANGE, ({ language }) => {
        setLanguage(language);
      });
      
      // Handle when users join - including getting the current participants
      socket.on(ACTIONS.JOINED, ({ clients }) => {
        setUserCount(clients.length);
        
        // Request code sync from others if we're not the first
        if (clients.length > 1 && !codeRef.current) {
          // Find another user to request code from
          const otherClient = clients.find(client => client.socketId !== socket.id);
          if (otherClient) {
            socket.emit(ACTIONS.SYNC_CODE, {
              socketId: otherClient.socketId,
              code: codeRef.current || ''
            });
          }
        }
      });
      
      // Handle disconnection of other users
      socket.on(ACTIONS.DISCONNECTED, () => {
        // Update user count from room-participants event
      });
      
      // Handle room participants update
      socket.on("room-participants", (participants) => {
        setUserCount(participants.length);
      });
    }

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off(ACTIONS.CODE_CHANGE);
        socket.off(ACTIONS.LANGUAGE_CHANGE);
        socket.off(ACTIONS.JOINED);
        socket.off(ACTIONS.DISCONNECTED);
        socket.off("room-participants");
      }
    };
  }, [socketRef, roomId, codeRef]);

  const handleChange = (value) => {
    codeRef.current = value;
    // Only emit if connected
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(ACTIONS.CODE_CHANGE, { roomId, code: value });
    }
  };

  // Toggle cursor blinking for focus indication
  const handleEditorFocus = () => {
    setCursorBlink(true);
  };

  const handleEditorBlur = () => {
    setCursorBlink(false);
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
      const newOutput = "✅ HTML/CSS Rendered below.";
      setOutput(newOutput);
      addToHistory(newOutput);
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
      const newOutput = "⚠️ Language execution not supported.";
      setOutput(newOutput);
      addToHistory(newOutput);
      return;
    }

    // Show running indicator
    setOutput("Running code...");

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
      let newOutput;
      
      if (result.stdout) {
        newOutput = result.stdout;
      } else if (result.stderr) {
        newOutput = "Error: " + result.stderr;
      } else if (result.compile_output) {
        newOutput = "Compile Error: " + result.compile_output;
      } else {
        newOutput = "No output received.";
      }
      
      setOutput(newOutput);
      addToHistory(newOutput);
    } catch (error) {
      console.error("Code execution error:", error);
      const newOutput = "Error running code.";
      setOutput(newOutput);
      addToHistory(newOutput);
    }
  };

  const addToHistory = (output) => {
    // Add to history and reset index to most recent
    setOutputHistory(prevHistory => {
      const newHistory = [...prevHistory, output];
      if (newHistory.length > 50) { // Limit history size
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(-1);
  };

  const navigateHistory = (direction) => {
    if (outputHistory.length === 0) return;
    
    let newIndex;
    if (direction === 'up') {
      // Navigate backward in history
      newIndex = historyIndex === -1 ? outputHistory.length - 1 : Math.max(0, historyIndex - 1);
    } else {
      // Navigate forward in history
      newIndex = historyIndex === -1 ? -1 : Math.min(outputHistory.length - 1, historyIndex + 1);
    }
    
    setHistoryIndex(newIndex);
    if (newIndex !== -1) {
      setOutput(outputHistory[newIndex]);
    } else if (direction === 'down' && historyIndex !== -1) {
      // If we're at the end of history going down, clear output
      setOutput("");
    }
  };

  const handleKeyDown = (e) => {
    // Handle Up and Down arrows in the output terminal
    if (e.target.closest('.output-terminal')) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateHistory('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateHistory('down');
      }
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

  const clearOutput = () => {
    setOutput("");
  };

  return (
    <div className="code-mirror-wrapper flex flex-col h-full" onKeyDown={handleKeyDown}>
      <div className="flex justify-between items-center mb-2">
        <LanguageSelector onLanguageChange={handleLanguageChange} />
        <div className="connection-status">
          <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-sm text-gray-300">
            {isConnected ? `Connected (${userCount} user${userCount !== 1 ? 's' : ''})` : 'Disconnected'}
          </span>
        </div>
      </div>
  
      <div className="flex-1 border border-gray-700 rounded-lg overflow-hidden shadow-lg">
        <CodeMirror
          value={codeRef.current || ''}
          height="100%"
          theme={oneDark}
          extensions={[
            getLanguageExtension(),
            customTheme,
            syntaxHighlighting(myHighlightStyle),
            EditorView.lineWrapping,
          ]}
          onChange={handleChange}
          onFocus={handleEditorFocus}
          onBlur={handleEditorBlur}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            highlightSelectionMatches: true,
            syntaxHighlighting: true,
          }}
        />
      </div>
  
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={handleRunCode}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2 shadow-md"
        >
          <span>▶️</span> Run Code
        </button>
        <button
          onClick={handleSaveCode}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2 shadow-md"
        >
          <span>💾</span> Save Code
        </button>
        <button
          onClick={clearOutput}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2 shadow-md"
        >
          <span>🧹</span> Clear Output
        </button>
      </div>
  
      <div 
        className="mt-4 p-4 bg-black rounded-lg text-green-400 overflow-auto min-h-[150px] max-h-[200px] output-terminal shadow-inner border border-gray-800"
        tabIndex="0"
      >
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-white">Output:</h3>
          <div className="text-xs text-gray-500">
            {outputHistory.length > 0 && (
              <span>Use ↑↓ keys to navigate history ({historyIndex !== -1 ? `${outputHistory.length - historyIndex}/${outputHistory.length}` : `0/${outputHistory.length}`})</span>
            )}
          </div>
        </div>
        <pre className="whitespace-pre-wrap">{output}</pre>
      </div>
  
      {(language === "html" || language === "css") && (
        <div className="mt-4 p-4 bg-white rounded-lg shadow-md border border-gray-300">
          <h3 className="font-bold text-black mb-2">Preview:</h3>
          <iframe
            ref={iframeRef}
            title="Live Preview"
            className="w-full h-64 border border-gray-300 rounded-md shadow-inner"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
};

export default Editor;