import React, { useEffect, useRef, useState } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/jsx/jsx';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/python/python';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/scroll/simplescrollbars';
import 'codemirror/addon/scroll/simplescrollbars.css';
import ACTIONS from '../action';

// Language IDs for Judge0 API
const LANGUAGE_IDS = {
  'javascript': 63,  // Node.js
  'js': 63,
  'jsx': 63,
  'python': 71,
  'java': 62,
  'c': 50,
  'cpp': 54,
  'ruby': 72,
  'php': 68,
  'csharp': 51,
  'go': 60,
  'rust': 73,
};

function Editor({ socketRef, roomId, onCodeChange, language = 'javascript' }) {
    const editorRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const codeRef = useRef(''); // Store the current code to prevent circular updates
    const [connectedUsers, setConnectedUsers] = useState([]);
    
    // Map file extensions/types to CodeMirror modes
    const getLanguageMode = (lang) => {
        const modes = {
            'javascript': 'javascript',
            'js': 'javascript',
            'jsx': 'jsx',
            'css': 'css',
            'html': 'htmlmixed',
            'python': 'python',
            'java': 'text/x-java',
            'c': 'text/x-csrc',
            'cpp': 'text/x-c++src',
            'ruby': 'ruby',
            'php': 'php',
            'csharp': 'text/x-csharp',
            'go': 'go',
            'rust': 'rust',
        };
        return modes[lang.toLowerCase()] || 'javascript';
    };

    // Initialize CodeMirror instance
    useEffect(() => {
        const textarea = document.getElementById('realtimeEditor');
        editorRef.current = CodeMirror.fromTextArea(textarea, {
            mode: getLanguageMode(language),
            theme: 'dracula',
            autoCloseTags: true,
            autoCloseBrackets: true,
            lineNumbers: true,
            styleActiveLine: true,
            scrollbarStyle: 'overlay',
            lineWrapping: true,
            tabSize: 2,
        });

        // Set initial height
        editorRef.current.setSize('100%', '100%');
        
        // Focus the editor
        setTimeout(() => {
            editorRef.current.focus();
            editorRef.current.refresh();
        }, 100);

        return () => {
            if (editorRef.current) {
                editorRef.current.toTextArea(); // Clean up the CodeMirror instance
            }
        };
    }, [language]);
    
    // Single event listener for code changes
    useEffect(() => {
        if (!editorRef.current) return;
        
        // Handle local code changes and emit to other clients
        const handleCodeChange = (instance, changes) => {
            const { origin } = changes;
            const code = instance.getValue();
            codeRef.current = code; // Keep track of our current code
          
            // Update parent component with code changes
            onCodeChange && onCodeChange(code);
      
            // Emit the code change to other clients in the same room
            // But only if the change originated from the user (not from setValue)
            if (origin !== 'setValue' && socketRef.current && socketRef.current.connected) {
                try {
                    console.log('Emitting code change to room:', roomId);
                    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code,
                    });
                } catch (err) {
                    console.error('Failed to emit code change:', err);
                    setError('Connection issue. Changes may not be synced.');
                    setConnected(false);
                }
            }
        };
      
        // Attach the change handler
        editorRef.current.on('change', handleCodeChange);
        
        console.log('Editor change handler attached');
      
        return () => {
            if (editorRef.current) {
                editorRef.current.off('change', handleCodeChange);
                console.log('Editor change handler removed');
            }
        };
    }, [roomId, socketRef, onCodeChange]); 

    // Initialize socket connection and handle socket events
    useEffect(() => {
        if (!socketRef.current) {
            setError('Socket not connected. Collaborative editing disabled.');
            setConnected(false);
            return;
        }

        // Check if socket is connected
        if (socketRef.current.connected) {
            setConnected(true);
            setError(null);
        } else {
            // Try to connect if not already connecting
            try {
                socketRef.current.connect();
            } catch (err) {
                console.error('Failed to connect socket:', err);
                setError('Failed to connect to server. Please try again.');
            }
        }

        // Handle socket connection status
        const handleConnect = () => {
            console.log('Socket connected successfully');
            setConnected(true);
            setError(null);
            
            // Join the room once connected
            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: localStorage.getItem('username') || 'Anonymous'
            });
          
            // Request code from others
            socketRef.current.emit(ACTIONS.GET_CODE, { roomId });
        };
        
        const handleDisconnect = () => {
            console.log('Socket disconnected');
            setConnected(false);
            setError('Disconnected from server. Attempting to reconnect...');
            setConnectedUsers([]);
        };

        const handleError = (err) => {
            console.error('Socket error:', err);
            setConnected(false);
            setError(`Connection error: ${err.message || 'Unknown error'}`);
        };

        const handleCodeUpdate = ({ code }) => {
            if (code !== null && editorRef.current) {
                console.log('Received code update from another client');
                
                // Only update if the code is different from what we have
                if (code !== codeRef.current) {
                    // Save cursor position
                    const cursor = editorRef.current.getCursor();
                    const scrollInfo = editorRef.current.getScrollInfo();
                    
                    // Update code without triggering change event
                    editorRef.current.setValue(code);
                    codeRef.current = code;
                    
                    // Restore cursor position and scroll position
                    editorRef.current.setCursor(cursor);
                    editorRef.current.scrollTo(scrollInfo.left, scrollInfo.top);
                    
                    // Notify parent component
                    onCodeChange && onCodeChange(code);
                    
                    console.log('Code updated from remote source');
                }
            }
        };

        // Handle code sync requests from other clients
        const handleGetCode = ({ socketId }) => {
            // Send our current code to the requesting client
            if (socketRef.current && editorRef.current) {
                const code = editorRef.current.getValue();
                socketRef.current.emit(ACTIONS.CODE_SYNC, {
                    code,
                    socketId,
                });
            }
        };

        // Handle code sync from other clients
        const handleCodeSync = ({ code }) => {
            if (code && editorRef.current && code !== codeRef.current) {
                const cursor = editorRef.current.getCursor();
                const scrollInfo = editorRef.current.getScrollInfo();
                
                editorRef.current.setValue(code);
                codeRef.current = code;
                
                editorRef.current.setCursor(cursor);
                editorRef.current.scrollTo(scrollInfo.left, scrollInfo.top);
                
                onCodeChange && onCodeChange(code);
            }
        };

        // Handle user joining the room
        const handleUserJoined = ({ clients, username, socketId }) => {
            console.log(`${username} joined the room`);
            setConnectedUsers(clients);
            
            // Send our code to the new user
            if (socketRef.current && editorRef.current) {
                setTimeout(() => {
                    const code = editorRef.current.getValue();
                    if (code) {
                        socketRef.current.emit(ACTIONS.SYNC_CODE, {
                            roomId,
                            code,
                            socketId
                        });
                    }
                }, 500);
            }
        };

        // Handle user leaving the room
        const handleUserLeft = ({ socketId, username, clients }) => {
            console.log(`${username} left the room`);
            setConnectedUsers(clients);
        };

        // Set up socket event listeners
        socketRef.current.on('connect', handleConnect);
        socketRef.current.on('disconnect', handleDisconnect);
        socketRef.current.on('error', handleError);
        socketRef.current.on(ACTIONS.CODE_CHANGE, handleCodeUpdate);
        socketRef.current.on(ACTIONS.GET_CODE, handleGetCode);
        socketRef.current.on(ACTIONS.CODE_SYNC, handleCodeSync);
        socketRef.current.on(ACTIONS.SYNC_CODE, handleCodeSync);
        socketRef.current.on(ACTIONS.USER_JOINED, handleUserJoined);
        socketRef.current.on(ACTIONS.USER_LEFT, handleUserLeft);
        socketRef.current.on(ACTIONS.CODE_OUTPUT, ({ output: remoteOutput }) => {
            if (remoteOutput !== null) {
                setOutput(remoteOutput);
            }
        });

        // If socket is already connected, manually trigger join room
        if (socketRef.current.connected) {
            handleConnect();
        }

        // Clean up event listeners when component unmounts
        return () => {
            if (socketRef.current) {
                socketRef.current.off('connect', handleConnect);
                socketRef.current.off('disconnect', handleDisconnect);
                socketRef.current.off('error', handleError);
                socketRef.current.off(ACTIONS.CODE_CHANGE, handleCodeUpdate);
                socketRef.current.off(ACTIONS.GET_CODE, handleGetCode);
                socketRef.current.off(ACTIONS.CODE_SYNC, handleCodeSync);
                socketRef.current.off(ACTIONS.SYNC_CODE, handleCodeSync);
                socketRef.current.off(ACTIONS.USER_JOINED, handleUserJoined);
                socketRef.current.off(ACTIONS.USER_LEFT, handleUserLeft);
                socketRef.current.off(ACTIONS.CODE_OUTPUT);
                
                // Leave the room when unmounting
                socketRef.current.emit(ACTIONS.LEAVE, { roomId });
            }
        };
    }, [socketRef, roomId, onCodeChange]);

    // Change language mode if it changes
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.setOption('mode', getLanguageMode(language));
        }
    }, [language]);

    // Function to run code using Judge0 API
    const runCode = async () => {
        if (!editorRef.current) return;
        
        const code = editorRef.current.getValue();
        if (!code.trim()) {
            setOutput("Error: No code to execute");
            return;
        }

        const languageId = LANGUAGE_IDS[language.toLowerCase()];
        if (!languageId) {
            setOutput(`Error: Language '${language}' is not supported for execution`);
            return;
        }

        setIsRunning(true);
        setOutput('Running code...');

        try {
            // Configure the Judge0 API request
            const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    "X-RapidAPI-Key": "d6915d0f2emsha6752c36c811d2ep1adfbdjsna851c64946a5",
                    "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
                },
                body: JSON.stringify({
                    source_code: code,
                    language_id: languageId,
                    stdin: '',
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const { token } = await response.json();

            // Poll for results
            let result;
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                
                const statusResponse = await fetch(`https://judge0-ce.p.rapidapi.com/submissions/${token}`, {
                    method: 'GET',
                    headers: {
                        "X-RapidAPI-Key": "d6915d0f2emsha6752c36c811d2ep1adfbdjsna851c64946a5",
                        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
                    }
                });

                if (!statusResponse.ok) {
                    throw new Error(`HTTP error! Status: ${statusResponse.status}`);
                }

                result = await statusResponse.json();
                
                if (result.status?.id >= 3) { // Status 3 or greater means processing is done
                    break;
                }
                
                attempts++;
            }

            // Process the execution result
            if (result.stdout) {
                setOutput(result.stdout);
            } else if (result.stderr) {
                setOutput(`Error: ${result.stderr}`);
            } else if (result.compile_output) {
                setOutput(`Compilation Error: ${result.compile_output}`);
            } else if (result.message) {
                setOutput(`Message: ${result.message}`);
            } else {
                setOutput('No output or error message received');
            }
            
        } catch (err) {
            console.error('Error executing code:', err);
            setOutput(`Error: ${err.message || 'Failed to execute code'}`);
        } finally {
            setIsRunning(false);
        }
    };

    // Share code execution results with other users in the room
    const shareOutput = () => {
        if (socketRef.current && connected) {
            try {
                socketRef.current.emit(ACTIONS.CODE_OUTPUT, {
                    roomId,
                    output,
                });
            } catch (err) {
                console.error('Failed to share output:', err);
            }
        }
    };

    // Function to manually request code sync
    const syncCode = () => {
        if (socketRef.current && connected) {
            try {
                socketRef.current.emit(ACTIONS.GET_CODE, { roomId });
                setOutput('Syncing code from other users...');
            } catch (err) {
                console.error('Failed to request code sync:', err);
                setError('Failed to sync code. Please try again.');
            }
        }
    };

    return (
        <div className="h-full flex flex-col">
            {error && (
                <div className="bg-red-600 text-white p-2 text-sm">
                    {error}
                    {!connected && (
                        <button 
                            className="ml-2 bg-white text-red-600 px-2 py-1 rounded text-xs"
                            onClick={() => {
                                if (socketRef.current) {
                                    try {
                                        socketRef.current.connect();
                                    } catch (err) {
                                        console.error('Failed to reconnect:', err);
                                    }
                                } else {
                                    window.location.reload();
                                }
                            }}
                        >
                            Reconnect
                        </button>
                    )}
                </div>
            )}
            
            <div className="flex flex-1 overflow-hidden">
                {/* Editor Section - 50% */}
                <div className="w-1/2 border-r border-gray-700">
                    <textarea id="realtimeEditor"></textarea>
                </div>
                
                {/* Output Section - 50% */}
                <div className="w-1/2 flex flex-col bg-gray-900">
                    <div className="p-2 bg-gray-800 flex justify-between items-center">
                        <span className="text-gray-300 font-semibold">Output</span>
                        <div className="flex gap-2">
                            <button 
                                className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={syncCode}
                                disabled={!connected}
                            >
                                Sync Code
                            </button>
                            <button 
                                className={`px-3 py-1 rounded text-white ${isRunning ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                onClick={runCode}
                                disabled={isRunning}
                            >
                                {isRunning ? 'Running...' : 'Run Code'}
                            </button>
                            <button 
                                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={shareOutput}
                                disabled={!output || isRunning}
                            >
                                Share Output
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 p-4 font-mono text-sm overflow-auto bg-gray-900 text-gray-200">
                        <pre>{output || 'Code output will appear here...'}</pre>
                    </div>
                </div>
            </div>
            
            <div className="p-2 bg-gray-800 text-gray-400 text-xs flex justify-between">
                <div>
                    <span className="mr-2">{connected ? '● Connected' : '○ Disconnected'}</span>
                    <span>Active users: {connectedUsers.length}</span>
                    {connectedUsers.length > 0 && (
                        <span className="ml-2">
                            ({connectedUsers.map(u => u.username).join(', ')})
                        </span>
                    )}
                </div>
                <span>Room: {roomId}</span>
                <span>Mode: {language}</span>
            </div>
        </div>
    );
}

export default Editor;