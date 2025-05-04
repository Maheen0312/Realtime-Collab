import React, { useEffect, useRef, useState } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/jsx/jsx';
import 'codemirror/mode/css/css';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/selection/active-line';
import 'codemirror/addon/scroll/simplescrollbars';
import 'codemirror/addon/scroll/simplescrollbars.css';
import ACTIONS from '../action';

function Editor({ socketRef, roomId, onCodeChange, language = 'javascript' }) {
    const editorRef = useRef(null);
    const [connected, setConnected] = useState(true);
    const [error, setError] = useState(null);
    
    // Map file extensions/types to CodeMirror modes
    const getLanguageMode = (lang) => {
        const modes = {
            'javascript': 'javascript',
            'js': 'javascript',
            'jsx': 'jsx',
            'css': 'css',
            'html': 'htmlmixed',
        };
        return modes[lang.toLowerCase()] || 'javascript';
    };

    useEffect(() => {
        // Initialize CodeMirror instance
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

        // Handle local code changes and emit to other clients
        const handleCodeChange = (instance, changes) => {
            const { origin } = changes;
            const code = instance.getValue();

            // Update parent component with code changes
            onCodeChange && onCodeChange(code);

            // Emit the code change to other clients in the same room
            if (origin !== 'setValue' && socketRef.current && connected) {
                try {
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

        editorRef.current.on('change', handleCodeChange);

        return () => {
            editorRef.current.off('change', handleCodeChange);
            editorRef.current.toTextArea(); // Clean up the CodeMirror instance
        };
    }, [language]);

    useEffect(() => {
        if (!socketRef.current) {
            setConnected(false);
            setError('Socket not connected. Collaborative editing disabled.');
            return;
        }

        // Listen for socket connection status
        const handleConnect = () => {
            setConnected(true);
            setError(null);
        };
        
        const handleDisconnect = () => {
            setConnected(false);
            setError('Disconnected from server. Attempting to reconnect...');
        };

        const handleError = (err) => {
            setConnected(false);
            setError(`Connection error: ${err.message}`);
        };

        // Listen for code changes from other clients
        const handleCodeUpdate = ({ code }) => {
            if (code !== null && editorRef.current) {
                // Save cursor position
                const cursor = editorRef.current.getCursor();
                // Update code without triggering change event
                editorRef.current.setValue(code);
                // Restore cursor position
                editorRef.current.setCursor(cursor);
            }
        };

        socketRef.current.on('connect', handleConnect);
        socketRef.current.on('disconnect', handleDisconnect);
        socketRef.current.on('error', handleError);
        socketRef.current.on(ACTIONS.CODE_CHANGE, handleCodeUpdate);

        return () => {
            if (socketRef.current) {
                socketRef.current.off('connect', handleConnect);
                socketRef.current.off('disconnect', handleDisconnect);
                socketRef.current.off('error', handleError);
                socketRef.current.off(ACTIONS.CODE_CHANGE, handleCodeUpdate);
            }
        };
    }, [socketRef.current, roomId]);

    // Change language mode if it changes
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.setOption('mode', getLanguageMode(language));
        }
    }, [language]);

    return (
        <div className="h-full flex flex-col">
            {error && (
                <div className="bg-red-600 text-white p-2 text-sm">
                    {error}
                    {!connected && (
                        <button 
                            className="ml-2 bg-white text-red-600 px-2 py-1 rounded text-xs"
                            onClick={() => window.location.reload()}
                        >
                            Reconnect
                        </button>
                    )}
                </div>
            )}
            <div className="flex-1 overflow-hidden">
                <textarea id="realtimeEditor"></textarea>
            </div>
            <div className="p-2 bg-gray-800 text-gray-400 text-xs flex justify-between">
                <span>{connected ? '● Connected' : '○ Disconnected'}</span>
                <span>Room: {roomId}</span>
                <span>Mode: {language}</span>
            </div>
        </div>
    );
}

export default Editor;