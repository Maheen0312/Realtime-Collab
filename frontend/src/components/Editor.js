import React, { useEffect, useRef, useState } from 'react';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/gutter';
import { foldGutter, indentOnInput } from '@codemirror/language';
import { bracketMatching } from '@codemirror/matchbrackets';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/closebrackets';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { rectangularSelection } from '@codemirror/rectangular-selection';
import { highlightSelectionMatches } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const languageExtensions = {
  javascript,
  html,
  css,
  python,
  cpp,
  java,
};

const languageMap = {
  javascript: 63,
  python: 71,
  cpp: 54,
  java: 62,
  html: 93,
  css: 93,
};

const CollaborativeEditor = ({ roomId }) => {
  const editorRef = useRef();
  const viewRef = useRef();
  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState('');

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider('wss://realtime-collab-backend-mysh.onrender.com', roomId, ydoc);
    provider.on('status', (event) => {
      if (event.status === 'connected') {
        console.log('WebSocket connected');
      } else {
        console.error('WebSocket connection failed', event);
      }
    });
    

    const ytext = ydoc.getText('codemirror');

    const languageExtension = languageExtensions[language] || javascript;

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...completionKeymap]),
        languageExtension(),
        yCollab(ytext, provider.awareness),
        EditorView.lineWrapping
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId, language]);

  const runCode = async () => {
    const code = viewRef.current.state.doc.toString();
    const langId = languageMap[language];

    const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: {
        "content-type": "application/json",
          "X-RapidAPI-Key": "d6915d0f2emsha6752c36c811d2ep1adfbdjsna851c64946a5",
          "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
      },
      body: JSON.stringify({
        source_code: code,
        language_id: langId
      })
    });

    const result = await response.json();
    setOutput(result.stdout || result.stderr || 'No output');
  };

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <select value={language} onChange={e => setLanguage(e.target.value)}>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
        </select>
        <button onClick={runCode}>Run Code</button>
      </div>
      <div ref={editorRef} style={{ height: '400px', width: '100%', border: '1px solid #ccc', borderRadius: '5px' }} />
      <div style={{ marginTop: '10px', background: '#1e1e1e', color: '#dcdcdc', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap' }}>
        <strong>Output:</strong>
        <div>{output}</div>
      </div>
    </div>
  );
};

export default CollaborativeEditor;
