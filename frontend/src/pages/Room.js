import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaShareAlt, FaSignOutAlt, FaFileAlt, FaEdit, FaEye, FaCog, FaTerminal, FaUsers } from "react-icons/fa";
import { IoMdClose } from "react-icons/io";
import Editor from "../components/Editor";
import Terminal from "../components/Terminal";
import VideoChat from "../components/VideoChat";
import Chatbot from "../components/Chatbot";
import UserList from '../components/UserList';
import { initSocket } from '../socket';
import { ACTIONS } from '../action';
import toast from 'react-hot-toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const Room = ({ socket, peerId, peerInstance }) => {
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const navigate = useNavigate();
  const { roomId } = useParams();
  const location = useLocation();
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const [clients, setClients] = useState([]);
  const [language, setLanguage] = useState('javascript');

  // Use useMemo to fix the state data dependency issue
  const stateData = useMemo(() => location.state || {}, [location.state]);
  
  const [activeMenu, setActiveMenu] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isRoomValid, setIsRoomValid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [userData, setUserData] = useState({
    name: stateData.name || localStorage.getItem("userName") || "",
    isHost: stateData.isHost || false,
    roomname: stateData.roomname || localStorage.getItem("roomName") || ""
  });
  console.log('Room ID:', roomId);
  // Theme colors based on mode
  const theme = {
    bg: darkMode ? "bg-gray-900" : "bg-gray-50",
    text: darkMode ? "text-white" : "text-gray-800",
    sidebar: darkMode ? "bg-gray-800" : "bg-gray-100",
    navbar: darkMode ? "bg-gray-800" : "bg-white",
    card: darkMode ? "bg-gray-800" : "bg-white",
    border: darkMode ? "border-gray-700" : "border-gray-200",
    buttonPrimary: darkMode ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-500 hover:bg-blue-400",
    buttonDanger: darkMode ? "bg-red-600 hover:bg-red-500" : "bg-red-500 hover:bg-red-400",
    buttonSuccess: darkMode ? "bg-green-600 hover:bg-green-500" : "bg-green-500 hover:bg-green-400",
    dropdownBg: darkMode ? "bg-gray-800" : "bg-white",
    dropdownHover: darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100",
  };
  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      
      // Handle connection errors
      socketRef.current.on('connect_error', (err) => {
        toast.error('Socket connection failed');
        navigate('/');
      });
      socketRef.current.on('connect_failed', (err) => {
        toast.error('Socket connection failed');
        navigate('/');
      });

      // Join room
      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: stateData.name || 'Anonymous',
      });

      // Listen for joined users
      socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
        if (username !== stateData.name) {
          toast.success(`${username} joined the room`);
        }
        setClients(clients);
        
        // Sync code for new user
        socketRef.current.emit(ACTIONS.SYNC_CODE, {
          socketId,
          code: codeRef.current,
          language,
        });
      });

      // Listen for disconnected users
      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });

      // Listen for language changes
      socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ language: newLanguage }) => {
        setLanguage(newLanguage);
      });
    };

    init();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current?.off(ACTIONS.JOINED);
      socketRef.current?.off(ACTIONS.DISCONNECTED);
      socketRef.current?.off(ACTIONS.LANGUAGE_CHANGE);
    };
  }, [roomId, stateData.name, navigate]);

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, {
      roomId,
      language: newLanguage,
    });
  };
  // Initial room validation
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
  
    const userName = stateData.name || localStorage.getItem("userName");
  
    if (!userName) {
      navigate("/");
      return;
    }
  
    setUserData(prev => ({
      ...prev,
      name: userName,
      isHost: stateData.isHost || false,
      roomname: stateData.roomname || localStorage.getItem("roomName") || ""
    }));
  
    localStorage.setItem("currentRoomId", roomId);
  
    if (!roomId) {
      navigate("/");
      return;
    }
  
    // 🔥 If the user is the host (creator), skip API check
    if (stateData.isHost) {
      setIsRoomValid(true);
      setIsLoading(false);
      return;
    }
  
    // Otherwise, check room on server
    setIsLoading(true);
    fetch(`${API_BASE_URL}/api/check-room/${roomId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Room check failed");
        return res.json();
      })
      .then((data) => {
        if (!data.exists) {
          alert("Invalid Room ID. Redirecting to home.");
          navigate("/");
        } else {
          setIsRoomValid(true);
          if (data.roomname) {
            localStorage.setItem("roomName", data.roomname);
            setUserData(prev => ({
              ...prev,
              roomname: data.roomname
            }));
          }
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error checking room:", err);
        alert("Error validating room. Redirecting to home.");
        navigate("/");
        setIsLoading(false);
      });
  
  }, [roomId, navigate, stateData]);
  

  useEffect(() => {
    if (!socket || !isRoomValid || !userData.name) return;
  
    const joinRoom = () => {
      console.log("Joining room:", roomId, "with user:", userData.name);
      
      // Emit join-room event with all required data
      socket.emit("join-room", {
        roomId,
        user: {
          name: userData.name,
          isHost: userData.isHost,
          id: socket.id,
          video: false,
          audio: false,
        },
      });
    };
  
    // Handle socket connect event
    const handleConnect = () => {
      console.log("Socket connected/reconnected");
      joinRoom();
    };
  
    // Listen for room-joined event
    const handleRoomJoined = (data) => {
      console.log("Successfully joined room:", data);
      setIsLoading(false);
      // Show success toast if needed
      showToast(`Successfully joined room: ${userData.roomname || roomId}`, "success");
    };
  
    // Listen for room-not-found event
    const handleRoomNotFound = () => {
      console.error("Room not found:", roomId);
      setIsLoading(false);
      alert("Room not found or no longer available");
      navigate("/");
    };
  
    // Handle general socket errors
    const handleError = (error) => {
      console.error("Socket error:", error);
      setIsLoading(false);
      if (typeof error === 'string') {
        alert(error);
      } else if (error.message) {
        alert(error.message);
      } else {
        alert("An error occurred with the connection");
      }
      navigate("/");
    };
  
    // Register all listeners
    socket.on("connect", handleConnect);
    socket.on("room-joined", handleRoomJoined);
    socket.on("room-not-found", handleRoomNotFound);
    socket.on("error", handleError);
  
    // If socket is already connected, join room immediately
    if (socket.connected) {
      joinRoom();
    }
  
    // Cleanup function to remove listeners
    return () => {
      socket.off("connect", handleConnect);
      socket.off("room-joined", handleRoomJoined);
      socket.off("room-not-found", handleRoomNotFound);
      socket.off("error", handleError);
    };
  }, [socket, isRoomValid, roomId, userData, navigate]);
  
  // The participants and related events handler should stay as a separate useEffect
  // but update it to handle the room-joined event properly
  useEffect(() => {
    if (!socket || !isRoomValid) return;
  
    // Setup socket listeners
    const handleParticipants = (list) => {
      console.log("Received participants list:", list);
      setParticipants(list);
    };
  
    const handleUserJoined = (user) => {
      console.log("User joined:", user);
      showToast(`${user.name} joined the room`);
    };
  
    const handleUserLeft = (user) => {
      console.log("User left:", user);
      showToast(`${user.name} left the room`);
    };
  
    // Register listeners
    socket.on("room-participants", handleParticipants);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    
    // Clean up listeners when component unmounts
    return () => {
      console.log("Cleaning up socket listeners");
      socket.off("room-participants", handleParticipants);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      
      // Ensure we leave the room when unmounting
      if (socket.connected) {
        socket.emit("leave-room", { roomId });
      }
    };
  }, [socket, isRoomValid, roomId]);

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  
  const showToast = (message, type = "info") => {
    const id = Date.now();
    const toast = { id, message, type };
    setToasts(prev => [...prev, toast]);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Handle file opening
  const handleFileOpen = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        // Use editor ref to set content
        if (editorRef.current && editorRef.current.setValue) {
          editorRef.current.setValue(content);
          showToast(`File "${file.name}" loaded successfully`, "success");
        }
      } catch (error) {
        console.error("Error reading file:", error);
        showToast(`Failed to open file: ${error.message}`, "error");
      }
    };
    reader.readAsText(file);
  };

  // Menu action handler
  const handleMenuAction = (action) => {
    setActiveMenu(null); // Close menu after selection
    
    switch (action) {
      case "save":
        if (editorRef.current && editorRef.current.getValue) {
          const content = editorRef.current.getValue();
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "code.txt";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("File saved successfully", "success");
        }
        break;
      case "toggleTheme":
        setDarkMode(prev => !prev);
        showToast(`Switched to ${darkMode ? "light" : "dark"} mode`, "info");
        break;
      case "copy":
      case "undo":
      case "redo":
      case "paste":
      case "zoomin":
      case "zoomout":
      case "find":
        // Pass these commands to the editor if it has these methods
        if (editorRef.current && editorRef.current[action]) {
          editorRef.current[action]();
        } else {
          showToast(`Editor action '${action}' not implemented`, "warning");
        }
        break;
      case "settings":
        // Implement settings dialog here
        showToast("Settings dialog coming soon!", "info");
        break;
      default:
        console.log(`Action '${action}' not implemented`);
    }
  };

  // Toggle terminal visibility
  const toggleTerminal = () => {
    setShowTerminal(prev => !prev);
    setActiveMenu(null); // Close the menu
  };

  // Leave room function
  const leaveRoom = () => {
    if (socket && socket.connected) {
      socket.emit("leave-room", { roomId });
    }
    // Clear room from localStorage
    localStorage.removeItem("currentRoomId");
    navigate("/");
  };

  // Copy room ID to clipboard
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
      .then(() => {
        showToast("Room ID copied to clipboard!", "success");
        setShowSharePopup(false);
      })
      .catch(err => {
        console.error("Failed to copy room ID:", err);
        showToast("Failed to copy room ID. Please try again.", "error");
      });
  };

  // Share room ID via different platforms
  const shareRoomId = (platform) => {
    const roomURL = `${window.location.origin}/join/${roomId}`;
    let shareURL;
    
    switch (platform) {
      case "whatsapp":
        shareURL = `https://wa.me/?text=Join%20my%20coding%20room%20with%20ID:%20${roomId}%20at%20${encodeURIComponent(roomURL)}`;
        window.open(shareURL, "_blank");
        break;
      case "email":
        shareURL = `mailto:?subject=Join%20my%20coding%20room&body=Join%20my%20coding%20room%20with%20ID:%20${roomId}%20at%20${encodeURIComponent(roomURL)}`;
        window.open(shareURL, "_blank");
        break;
      case "twitter":
        shareURL = `https://twitter.com/intent/tweet?text=Join%20my%20coding%20room%20with%20ID:%20${roomId}&url=${encodeURIComponent(roomURL)}`;
        window.open(shareURL, "_blank");
        break;
      default:
        navigator.share({
          title: "Join my coding room",
          text: `Join my coding room with ID: ${roomId}`,
          url: roomURL
        }).catch(err => console.error("Share failed:", err));
    }
    setShowSharePopup(false);
  };
  
  // Get participant data for VideoChat
  const getParticipantData = () => {
    const participantData = {};
    participants.forEach(p => {
      participantData[p.socketId] = p.name;
    });
    return participantData;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + key shortcuts
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            handleMenuAction("save");
            break;
          case '`':
            e.preventDefault();
            toggleTerminal();
            break;
          case 'd':
            e.preventDefault();
            setDarkMode(prev => !prev);
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  return (
    <div className={`flex flex-col h-screen w-full ${theme.bg} ${theme.text} font-sans transition-colors duration-300`}>
      <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileOpen} />

      {/* Navbar */}
      <div className={`flex items-center justify-between p-3 ${theme.navbar} shadow-md border-b ${theme.border} transition-colors duration-300`}>
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            {[
              { name: "File", icon: <FaFileAlt className="mr-1" /> },
              { name: "Edit", icon: <FaEdit className="mr-1" /> },
              { name: "View", icon: <FaEye className="mr-1" /> }
            ].map((menu) => (
              <div key={menu.name} className="relative dropdown">
                <button
                  className={`px-3 py-2 ${activeMenu === menu.name ? 'bg-blue-600' : theme.dropdownBg} rounded-md transition flex items-center text-sm hover:bg-opacity-80`}
                  onClick={() => setActiveMenu(activeMenu === menu.name ? null : menu.name)}
                >
                  {menu.icon} {menu.name}
                </button>
                {activeMenu === menu.name && (
                  <div className={`absolute left-0 mt-1 w-56 ${theme.dropdownBg} border ${theme.border} rounded-lg shadow-xl z-50 animate-fadeIn`}>
                    <ul className="text-sm py-1">
                      {menu.name === "File" && (
                        <>
                          <li className={`px-4 py-2 ${theme.dropdownHover} cursor-pointer flex items-center`} onClick={() => fileInputRef.current.click()}>
                            <span className="mr-2">📂</span> Open File
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} cursor-pointer flex items-center`} onClick={() => handleMenuAction("save")}>
                            <span className="mr-2">💾</span> Save File
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} cursor-pointer flex items-center`} onClick={() => handleMenuAction("settings")}>
                            <span className="mr-2">⚙️</span> Settings
                          </li>
                          <li className="border-t border-gray-600 my-1"></li>
                          <li className={`px-4 py-2 hover:bg-red-500 hover:text-white cursor-pointer flex items-center`} onClick={leaveRoom}>
                            <span className="mr-2">🚪</span> Leave Room
                          </li>
                        </>
                      )}
                      {menu.name === "Edit" && (
                        <>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("copy")}>
                            <span className="mr-2">📋</span> Copy <span className="ml-auto opacity-60 text-xs">Ctrl+C</span>
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("paste")}>
                            <span className="mr-2">📄</span> Paste <span className="ml-auto opacity-60 text-xs">Ctrl+V</span>
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("undo")}>
                            <span className="mr-2">↩️</span> Undo <span className="ml-auto opacity-60 text-xs">Ctrl+Z</span>
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("redo")}>
                            <span className="mr-2">↪️</span> Redo <span className="ml-auto opacity-60 text-xs">Ctrl+Y</span>
                          </li>
                          <li className="border-t border-gray-600 my-1"></li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("find")}>
                            <span className="mr-2">🔍</span> Find <span className="ml-auto opacity-60 text-xs">Ctrl+F</span>
                          </li>
                        </>
                      )}
                      {menu.name === "View" && (
                        <>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={toggleTerminal}>
                            <span className="mr-2">💻</span> Toggle Terminal <span className="ml-auto opacity-60 text-xs">Ctrl+`</span>
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("zoomin")}>
                            <span className="mr-2">🔍</span> Zoom In <span className="ml-auto opacity-60 text-xs">Ctrl++</span>
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("zoomout")}>
                            <span className="mr-2">🔍</span> Zoom Out <span className="ml-auto opacity-60 text-xs">Ctrl+-</span>
                          </li>
                          <li className="border-t border-gray-600 my-1"></li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => handleMenuAction("toggleTheme")}>
                            <span className="mr-2">{darkMode ? '☀️' : '🌙'}</span> Toggle Theme <span className="ml-auto opacity-60 text-xs">Ctrl+D</span>
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => setSidebarCollapsed(prev => !prev)}>
                            <span className="mr-2">🔄</span> Toggle Left Sidebar
                          </li>
                          <li className={`px-4 py-2 ${theme.dropdownHover} flex items-center`} onClick={() => setChatCollapsed(prev => !prev)}>
                            <span className="mr-2">🔄</span> Toggle Right Sidebar
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
          {userData.roomname && (
            <div className="ml-4 text-lg font-semibold text-blue-400 flex items-center">
              <span className="bg-blue-500 bg-opacity-20 px-3 py-1 rounded-md">
                {userData.roomname}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-sm px-3 py-1 bg-gray-700 bg-opacity-40 rounded-md">
            {participants.length}/6 users
          </span>
          <button 
            className={`px-3 py-2 ${theme.buttonPrimary} rounded-md flex items-center gap-2 text-sm transition-colors duration-200`} 
            onClick={() => setShowSharePopup(true)}
          >
            <FaShareAlt /> <span>Share</span>
          </button>
          <button 
            className={`px-3 py-2 ${theme.buttonDanger} rounded-md flex items-center gap-2 text-sm transition-colors duration-200`} 
            onClick={leaveRoom}
          >
            <FaSignOutAlt /> <span>Leave</span>
          </button>
          <button 
            className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-blue-100 text-blue-800'}`}
            onClick={() => setDarkMode(prev => !prev)}
            title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-grow gap-2 p-2 overflow-hidden">

        {/* Editor - central */}
        <div className="editor-page">
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Connected Users</h3>
        </div>
        <div className="connected-users">
          <UserList clients={clients} />
        </div>
      </div>
      <div className="editor-container">
        <div className="editor-header">
          <div className="language-dropdown">
            <select 
              className="language-select" 
              value={language} 
              onChange={handleLanguageChange}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
          </div>
        </div>
        <Editor 
          socketRef={socketRef}
          roomId={roomId}
          language={language}
          codeRef={codeRef}
        />
      </div>
    </div>

        {/* Right sidebar - collapsible */}
        {!chatCollapsed && (
          <div className={`relative flex flex-col w-1/5 ${theme.sidebar} rounded-xl border ${theme.border} overflow-hidden transition-all duration-300`}>
            <button 
              className="absolute -left-3 top-2 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs"
              onClick={() => setChatCollapsed(true)}
              title="Collapse chat"
            >
              <span>→</span>
            </button>
            
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Video chat section */}
              <div className="h-1/2 overflow-auto p-2">
                <VideoChat 
                  socket={socket} 
                  roomId={roomId}
                  userId={socket?.id}
                  participants={getParticipantData()}
                  darkMode={darkMode}
                />
              </div>
              
              {/* Chat section */}
              <div className="h-1/2 overflow-auto p-2 border-t border-gray-700">
                <Chatbot darkMode={darkMode} />
              </div>
            </div>
          </div>
        )}
        
        {/* Collapsed chat button */}
        {chatCollapsed && (
          <div className="w-8 flex items-center">
            <button 
              className="w-8 h-20 bg-gray-700 rounded-l-md flex items-center justify-center"
              onClick={() => setChatCollapsed(false)}
              title="Expand chat"
            >
              <span>←</span>
            </button>
          </div>
        )}
      </div>

      {/* Terminal - collapsible bottom panel */}
      {showTerminal && (
        <div className={`relative h-1/4 ${theme.sidebar} p-2 border-t ${theme.border} transition-all duration-300`}>
          <div className="flex justify-between items-center mb-2">
            <div className="font-mono text-sm flex items-center">
              <FaTerminal className="mr-2" /> Terminal
            </div>
            <button 
              className="p-1 hover:bg-gray-700 rounded-md"
              onClick={toggleTerminal}
              title="Close terminal"
            >
              <IoMdClose />
            </button>
          </div>
          <Terminal socket={socket} darkMode={darkMode} />
        </div>
      )}

      {showSharePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6 w-96">
            <h2 className="text-lg font-bold mb-4 text-center">🔗 Share Room ID</h2>
            <p className="text-green-400 font-mono break-all text-center mb-4">{roomId}</p>
            <div className="flex justify-between">
              <button onClick={copyRoomId} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md">Copy</button>
              <button onClick={() => shareRoomId("whatsapp")} className="bg-green-500 hover:bg-green-400 px-4 py-2 rounded-md">WhatsApp</button>
              <button onClick={() => setShowSharePopup(false)} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-md">Close</button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="inline-block w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-xl font-semibold">Connecting to room...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;
