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

// Define ACTIONS for socket communication
const ACTIONS = {
  JOIN: 'join',
  JOINED: 'joined',
  CODE_CHANGE: 'code-change',
  SYNC_CODE: 'sync-code',
  DISCONNECTED: 'disconnected',
  LANGUAGE_CHANGE: 'language-change',
  CURSOR_POSITION: 'cursor-position',
  USER_TYPING: 'user-typing',
  COMMENT: 'comment',
  COMMENTS_SYNC: 'comments-sync',
  CODE_SELECTION: 'code-selection',
};

const Editor = ({ socketRef, roomId, codeRef }) => {
  const editorRef = useRef(null);
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState('javascript');
  const iframeRef = useRef(null);
  const [outputHistory, setOutputHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [cursorBlink, setCursorBlink] = useState(true);
  const [participants, setParticipants] = useState([]);
  const [comments, setComments] = useState([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentPosition, setCommentPosition] = useState({ x: 0, y: 0, lineNumber: 0 });
  const [commentText, setCommentText] = useState('');
  const [activeUsers, setActiveUsers] = useState({});
  const [userTyping, setUserTyping] = useState({});
  const [saveStatus, setSaveStatus] = useState('');
  const [editorHistory, setEditorHistory] = useState([]);
  const [historyPosition, setHistoryPosition] = useState(-1);
  const typingTimeoutRef = useRef({});
  const editorContainerRef = useRef(null);
  
  // Function to update language and notify others
  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    // Emit language change to other users
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: newLanguage });
    }
  };

  // Enhanced connection handling
  useEffect(() => {
    const socket = socketRef.current;
    if (socket) {
      // Setup connection status
      socket.on('connect', () => {
        setIsConnected(true);
        // Join the code editor room with username
        const username = localStorage.getItem('username') || 'User-' + Math.floor(Math.random() * 1000);
        const userColor = localStorage.getItem('userColor') || getRandomColor();
        localStorage.setItem('userColor', userColor);
        
        socket.emit(ACTIONS.JOIN, { 
          roomId, 
          username,
          userColor
        });
      });
      
      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      // Handle code changes from other users
      socket.on(ACTIONS.CODE_CHANGE, ({ code, userId }) => {
        if (code !== null && code !== codeRef.current) {
          codeRef.current = code;
          if (editorRef.current) {
            editorRef.current.setValue(code);
            
            // Add to undo history
            addToEditorHistory(code);
          }
          
          // Show typing indicator for the user
          handleUserTyping(userId);
        }
      });
      
      // Handle language changes
      socket.on(ACTIONS.LANGUAGE_CHANGE, ({ language }) => {
        setLanguage(language);
      });
      
      // Handle cursor position updates
      socket.on(ACTIONS.CURSOR_POSITION, ({ userId, position, username, userColor }) => {
        updateUserCursor(userId, position, username, userColor);
      });
      
      // Handle user typing indicators
      socket.on(ACTIONS.USER_TYPING, ({ userId, username, isTyping }) => {
        setUserTyping(prev => ({
          ...prev,
          [userId]: isTyping ? { username, timestamp: Date.now() } : undefined
        }));
        
        // Auto-clear typing indicator after 2 seconds of inactivity
        if (isTyping && typingTimeoutRef.current[userId]) {
          clearTimeout(typingTimeoutRef.current[userId]);
        }
        
        if (isTyping) {
          typingTimeoutRef.current[userId] = setTimeout(() => {
            setUserTyping(prev => ({
              ...prev,
              [userId]: undefined
            }));
          }, 2000);
        }
      });
      
      // Handle comments
      socket.on(ACTIONS.COMMENT, ({ comment }) => {
        setComments(prevComments => [...prevComments, comment]);
      });
      
      socket.on(ACTIONS.COMMENTS_SYNC, ({ comments }) => {
        setComments(comments);
      });
      
      // Handle code selection by other users
      socket.on(ACTIONS.CODE_SELECTION, ({ userId, selection, username, userColor }) => {
        highlightUserSelection(userId, selection, username, userColor);
      });
      
      // Handle when users join - including getting the current participants
      socket.on(ACTIONS.JOINED, ({ clients, socketId }) => {
        setParticipants(clients);
        setUserCount(clients.length);
        
        // Request code sync from others if we're not the first
        if (clients.length > 1 && !codeRef.current && socketId === socket.id) {
          // Find another user to request code from
          const otherClient = clients.find(client => client.socketId !== socket.id);
          if (otherClient) {
            socket.emit(ACTIONS.SYNC_CODE, {
              socketId: otherClient.socketId,
              code: codeRef.current || ''
            });
          }
        }
        
        // If we already have comments, sync them with new users
        if (comments.length > 0 && clients.some(client => client.socketId === socketId && client.socketId !== socket.id)) {
          socket.emit(ACTIONS.COMMENTS_SYNC, {
            socketId,
            comments
          });
        }
      });
      
      // Handle disconnection of other users
      socket.on(ACTIONS.DISCONNECTED, ({ socketId }) => {
        // Remove user cursor and data
        removeUserCursor(socketId);
        removeUserSelection(socketId);
        
        // Update participants
        setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      });
      
      // Handle room participants update
      socket.on("room-participants", (participants) => {
        setParticipants(participants);
        setUserCount(participants.length);
      });
    }

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off(ACTIONS.CODE_CHANGE);
        socket.off(ACTIONS.LANGUAGE_CHANGE);
        socket.off(ACTIONS.CURSOR_POSITION);
        socket.off(ACTIONS.USER_TYPING);
        socket.off(ACTIONS.COMMENT);
        socket.off(ACTIONS.COMMENTS_SYNC);
        socket.off(ACTIONS.CODE_SELECTION);
        socket.off(ACTIONS.JOINED);
        socket.off(ACTIONS.DISCONNECTED);
        socket.off("room-participants");
      }
      
      // Clear typing timeouts
      Object.values(typingTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
    };
  }, [socketRef, roomId, codeRef, comments]);

  // Generate random user color
  const getRandomColor = () => {
    const colors = [
      '#FF5733', '#33FF57', '#3357FF', '#FF33F5', 
      '#F5FF33', '#33FFF5', '#F533FF', '#FF5733'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };
  
  // Function to update cursor positions of other users
  const updateUserCursor = (userId, position, username, userColor) => {
    setActiveUsers(prev => ({
      ...prev,
      [userId]: { position, username, userColor, timestamp: Date.now() }
    }));
    
    // Display visual cursor in editor
    const cursorElement = document.querySelector(`.user-cursor-${userId}`);
    const editorContainer = editorContainerRef.current;
    
    if (editorContainer && position) {
      let cursorEl = cursorElement;
      
      if (!cursorEl) {
        cursorEl = document.createElement('div');
        cursorEl.classList.add(`user-cursor-${userId}`);
        cursorEl.style.position = 'absolute';
        cursorEl.style.pointerEvents = 'none';
        cursorEl.style.zIndex = '10';
        editorContainer.appendChild(cursorEl);
      }
      
      // Position for cursor (these are placeholder values - real implementation would
      // need to calculate actual position based on CodeMirror coordinates)
      cursorEl.style.left = `${position.x}px`;
      cursorEl.style.top = `${position.y}px`;
      cursorEl.innerHTML = `
        <div style="position: relative;">
          <div style="position: absolute; background-color: ${userColor}; width: 2px; height: 20px;"></div>
          <div style="position: absolute; background-color: ${userColor}; color: white; font-size: 12px; padding: 2px 4px; border-radius: 3px; top: -18px; white-space: nowrap;">${username}</div>
        </div>
      `;
    }
  };
  
  // Function to remove user cursor when they disconnect
  const removeUserCursor = (userId) => {
    setActiveUsers(prev => {
      const newState = {...prev};
      delete newState[userId];
      return newState;
    });
    
    const cursorElement = document.querySelector(`.user-cursor-${userId}`);
    if (cursorElement) cursorElement.remove();
  };
  
  // Function to highlight code selection by other users
  const highlightUserSelection = (userId, selection, username, userColor) => {
    // This is a placeholder - real implementation would need to 
    // use CodeMirror's API to highlight text ranges
    console.log(`User ${username} selected from ${selection.from} to ${selection.to}`);
  };
  
  // Function to remove user selection highlight
  const removeUserSelection = (userId) => {
    // Remove selection highlights using CodeMirror API
    console.log(`Removing selection for user ${userId}`);
  };
  
  // Function to handle user typing indicators
  const handleUserTyping = (userId) => {
    const user = participants.find(p => p.socketId === userId);
    if (user) {
      setUserTyping(prev => ({
        ...prev,
        [userId]: { username: user.username, timestamp: Date.now() }
      }));
      
      // Auto-clear typing indicator after 2 seconds
      if (typingTimeoutRef.current[userId]) {
        clearTimeout(typingTimeoutRef.current[userId]);
      }
      
      typingTimeoutRef.current[userId] = setTimeout(() => {
        setUserTyping(prev => {
          const newState = {...prev};
          delete newState[userId];
          return newState;
        });
      }, 2000);
    }
  };
  
  // Track cursor position and emit to other users
  const handleCursorActivity = (editor) => {
    if (socketRef.current && socketRef.current.connected) {
      const cursor = editor.getCursor();
      const cursorCoords = editor.cursorCoords(cursor);
      
      // Get username and color
      const username = localStorage.getItem('username') || 'User';
      const userColor = localStorage.getItem('userColor') || '#FF5733';
      
      // Emit cursor position
      socketRef.current.emit(ACTIONS.CURSOR_POSITION, {
        roomId,
        position: {
          line: cursor.line,
          ch: cursor.ch,
          x: cursorCoords.left,
          y: cursorCoords.top
        },
        username,
        userColor
      });
    }
  };
  
  // Track code selection and emit to other users
  const handleSelectionChange = (editor) => {
    if (socketRef.current && socketRef.current.connected) {
      const selection = editor.getSelection();
      if (selection && selection.length > 0) {
        const from = editor.getCursor('from');
        const to = editor.getCursor('to');
        
        // Get username and color
        const username = localStorage.getItem('username') || 'User';
        const userColor = localStorage.getItem('userColor') || '#FF5733';
        
        // Emit selection
        socketRef.current.emit(ACTIONS.CODE_SELECTION, {
          roomId,
          selection: { from, to },
          username,
          userColor
        });
      }
    }
  };
  
  // Add comment to specific line
  const addComment = (lineNumber) => {
    const editorContainer = editorContainerRef.current;
    if (!editorContainer) return;
    
    const lineElement = editorContainer.querySelector(`.cm-line:nth-child(${lineNumber + 1})`);
    if (!lineElement) return;
    
    const rect = lineElement.getBoundingClientRect();
    const containerRect = editorContainer.getBoundingClientRect();
    
    setCommentPosition({
      x: rect.right - containerRect.left + 10,
      y: rect.top - containerRect.top,
      lineNumber
    });
    
    setShowCommentInput(true);
  };
  
  // Submit comment
  const submitComment = () => {
    if (!commentText.trim()) {
      setShowCommentInput(false);
      return;
    }
    
    const username = localStorage.getItem('username') || 'User';
    const userColor = localStorage.getItem('userColor') || '#FF5733';
    
    const newComment = {
      id: Date.now().toString(),
      lineNumber: commentPosition.lineNumber,
      text: commentText,
      username,
      userColor,
      timestamp: new Date().toISOString()
    };
    
    setComments(prevComments => [...prevComments, newComment]);
    
    // Emit comment to other users
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(ACTIONS.COMMENT, {
        roomId,
        comment: newComment
      });
    }
    
    setShowCommentInput(false);
    setCommentText('');
  };
  
  // Delete comment
  const deleteComment = (commentId) => {
    setComments(prevComments => prevComments.filter(c => c.id !== commentId));
    
    // Sync comment deletion with other users
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(ACTIONS.COMMENTS_SYNC, {
        roomId,
        comments: comments.filter(c => c.id !== commentId)
      });
    }
  };
  
  // Add to editor history for undo/redo
  const addToEditorHistory = (code) => {
    // Don't add if it's the same as the last entry
    if (editorHistory.length > 0 && editorHistory[editorHistory.length - 1] === code) {
      return;
    }
    
    // If we're not at the end of history, truncate
    const newHistory = historyPosition === -1 ? 
      [...editorHistory, code] : 
      [...editorHistory.slice(0, historyPosition + 1), code];
    
    // Limit history size
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setEditorHistory(newHistory);
    setHistoryPosition(newHistory.length - 1);
  };
  
  // Undo function
  const handleUndo = () => {
    if (historyPosition > 0) {
      const newPosition = historyPosition - 1;
      const codeToRestore = editorHistory[newPosition];
      
      codeRef.current = codeToRestore;
      if (editorRef.current) {
        editorRef.current.setValue(codeToRestore);
      }
      
      setHistoryPosition(newPosition);
      
      // Emit code change
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ACTIONS.CODE_CHANGE, { 
          roomId, 
          code: codeToRestore,
          userId: socketRef.current.id
        });
      }
    }
  };
  
  // Redo function
  const handleRedo = () => {
    if (historyPosition < editorHistory.length - 1) {
      const newPosition = historyPosition + 1;
      const codeToRestore = editorHistory[newPosition];
      
      codeRef.current = codeToRestore;
      if (editorRef.current) {
        editorRef.current.setValue(codeToRestore);
      }
      
      setHistoryPosition(newPosition);
      
      // Emit code change
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit(ACTIONS.CODE_CHANGE, { 
          roomId, 
          code: codeToRestore,
          userId: socketRef.current.id
        });
      }
    }
  };

  const handleChange = (value) => {
    // Add to undo history
    addToEditorHistory(value);
    
    codeRef.current = value;
    
    // Only emit if connected
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(ACTIONS.CODE_CHANGE, { 
        roomId, 
        code: value,
        userId: socketRef.current.id
      });
      
      // Emit typing status
      socketRef.current.emit(ACTIONS.USER_TYPING, { 
        roomId, 
        userId: socketRef.current.id,
        username: localStorage.getItem('username') || 'User',
        isTyping: true
      });
    }
    
    // Show saving indicator
    setSaveStatus('Saving...');
    setTimeout(() => {
      setSaveStatus('All changes saved');
    }, 500);
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
    
    // Global shortcut for undo/redo
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key === 'y') {
        e.preventDefault();
        handleRedo();
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
  
  // Function to show line numbers with comment indicators
  const renderLineNumbers = () => {
    // Placeholder - real implementation would need to 
    // extend CodeMirror to customize line numbers rendering
    console.log("Rendering line numbers with comment indicators");
  };
  
  // Helper to format timestamps
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="code-mirror-wrapper flex flex-col h-full" onKeyDown={handleKeyDown} ref={editorContainerRef}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <LanguageSelector onLanguageChange={handleLanguageChange} />
          <div className="text-xs text-gray-400">{saveStatus}</div>
        </div>
        <div className="connection-status flex items-center">
          <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-sm text-gray-300">
            {isConnected ? `Connected (${userCount} user${userCount !== 1 ? 's' : ''})` : 'Disconnected'}
          </span>
        </div>
      </div>
      
      {/* Active users */}
      <div className="flex mb-2 gap-2 overflow-x-auto">
        {participants.map((participant) => (
          <div 
            key={participant.socketId} 
            className="px-2 py-1 rounded-full text-xs flex items-center gap-1"
            style={{ backgroundColor: participant.userColor + '30', color: participant.userColor }}
          >
            <span 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: participant.userColor }}
            ></span>
            {participant.username}
            {userTyping[participant.socketId] && (
              <span className="ml-1 text-gray-300 text-xs">typing...</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 border border-gray-700 rounded-lg overflow-hidden shadow-lg relative">
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
          // This would need to be implemented with CodeMirror's view plugins
          // onCursorActivity={cm => handleCursorActivity(cm.editor)}
          // onSelectionChange={cm => handleSelectionChange(cm.editor)}
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
        
        {/* Comment bubbles */}
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="absolute rounded-lg p-2 bg-gray-800 border border-gray-700 shadow-lg max-w-xs z-10"
            style={{
              left: `calc(100% - 30px)`,
              top: `${(comment.lineNumber * 20) + 5}px`, // Rough estimate - would need accurate line height
            }}
          >
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1">
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: comment.userColor }}
                ></span>
                <span className="text-xs font-semibold">{comment.username}</span>
                <span className="text-xs text-gray-400">{formatTime(comment.timestamp)}</span>
              </div>
              <button 
                className="text-xs text-gray-400 hover:text-white"
                onClick={() => deleteComment(comment.id)}
              >
                ×
              </button>
            </div>
            <div className="text-sm">{comment.text}</div>
          </div>
        ))}
        
        {/* Comment input popup */}
        {showCommentInput && (
          <div
            className="absolute rounded-lg p-2 bg-gray-800 border border-gray-700 shadow-lg z-20"
            style={{
              left: commentPosition.x,
              top: commentPosition.y,
              width: '250px'
            }}
          >
            <textarea
              className="w-full h-20 p-2 text-sm bg-gray-900 border border-gray-700 rounded"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                onClick={() => setShowCommentInput(false)}
              >
                Cancel
              </button>
              <button
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
                onClick={submitComment}
              >
                Add Comment
              </button>
            </div>
          </div>
        )}
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
        <button
          onClick={() => {
            const lineNumber = editorRef.current?.getCursor()?.line || 0;
            addComment(lineNumber);
          }}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2 shadow-md"
        >
          <span>💬</span> Add Comment
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleUndo}
            disabled={historyPosition <= 0}
            className={`bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2 shadow-md ${historyPosition <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'}`}
          >
            <span>↩️</span> Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={historyPosition >= editorHistory.length - 1}
            className={`bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2 shadow-md ${historyPosition >= editorHistory.length - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'}`}
          >
            <span>↪️</span> Redo
          </button>
        </div>
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
      
      {/* Participants panel */}
      <div className="mt-4 p-4 bg-gray-800 rounded-lg shadow-md border border-gray-700">
        <h3 className="font-bold text-white mb-2">Participants ({participants.length})</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {participants.map((participant) => (
            <div 
              key={participant.socketId}
              className="flex items-center gap-2 p-2 rounded-md bg-gray-900"
            >
              <div 
                className="w-4 h-4 rounded-full" 
                style={{ backgroundColor: participant.userColor }}
              ></div>
              <span className="text-sm truncate">{participant.username}</span>
              {userTyping[participant.socketId] && (
                <span className="animate-pulse text-xs text-gray-400">typing...</span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Comments section */}
      <div className="mt-4 p-4 bg-gray-800 rounded-lg shadow-md border border-gray-700">
        <h3 className="font-bold text-white mb-2">Comments ({comments.length})</h3>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-gray-400 text-sm">No comments yet. Click "Add Comment" to start a discussion.</p>
          ) : (
            comments.map(comment => (
              <div key={comment.id} className="p-2 bg-gray-900 rounded-md">
                <div className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: comment.userColor }}
                    ></div>
                    <span className="text-xs font-semibold">{comment.username}</span>
                    <span className="text-xs text-gray-400">Line {comment.lineNumber + 1}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatTime(comment.timestamp)}</span>
                </div>
                <p className="mt-1 text-sm">{comment.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Editor;