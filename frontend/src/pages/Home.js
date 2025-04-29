import { useState, useEffect } from 'react';

export default function RoomJoinPage() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [socket, setSocket] = useState(null);

  // Mock navigate function for demo
  const navigate = (path) => {
    console.log(`Navigating to: ${path}`);
    // In a real app, this would use react-router's navigate
    // For demo purposes:
    setError(`Success! Would navigate to: ${path}`);
  };

  // Connect to socket on component mount
  useEffect(() => {
    // In a real app, this would connect to your socket server
    // For demo purposes:
    console.log('Socket would connect here');
    setSocket({ id: 'mock-socket-id', connected: true });

    return () => {
      console.log('Socket would disconnect here');
    };
  }, []);

  // Function to generate a unique room ID
  const generateRoomId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Function to simulate joining a room
  const joinRoom = async (roomIdToJoin, isHost = false) => {
    // In a real app, this would use socket.io
    console.log(`Joining room: ${roomIdToJoin} as ${isHost ? 'host' : 'guest'}`);
    
    // Simulate API response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, roomId: roomIdToJoin });
      }, 500);
    });
  };

  // Handle joining an existing room
  const handleJoinRoom = async () => {
    if (!roomId || !username) {
      setError('Room ID and username are required');
      return;
    }

    setError('');
    setIsJoining(true);

    try {
      // Simulate checking if room exists
      const roomExists = Math.random() > 0.3; // 70% chance room exists
      
      let joinResult;
      
      if (roomExists) {
        // Room exists, join as regular user
        joinResult = await joinRoom(roomId, false);
      } else {
        // Try to join as host if room doesn't exist
        setError('Room not found. Trying to create it...');
        joinResult = await joinRoom(roomId, true);
      }

      if (joinResult.success) {
        // Navigate to editor page on success
        navigate(`/editor/${roomId}?username=${encodeURIComponent(username)}`);
      }
    } catch (err) {
      console.error('Join error:', err);
      setError(`Error joining room: ${err.message}`);
    } finally {
      setIsJoining(false);
    }
  };

  // Handle creating a new room
  const handleCreateRoom = async () => {
    if (!roomName || !username) {
      setError('Room name and username are required');
      return;
    }

    setError('');
    setIsCreating(true);

    try {
      // Generate a unique room ID
      const newRoomId = generateRoomId();
      
      // Join as host
      const result = await joinRoom(newRoomId, true);
      
      if (result.success) {
        // Navigate to editor page on success
        navigate(`/editor/${newRoomId}?username=${encodeURIComponent(username)}`);
      }
    } catch (err) {
      console.error('Create error:', err);
      setError(`Error creating room: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    // Implement logout logic here
    console.log('Logging out');
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-900 to-teal-800">
      {/* Header */}
      <header className="flex justify-end p-4">
        <button 
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded"
        >
          Logout
        </button>
      </header>
      
      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-pink-300 mb-2">Realtime Code Collaboration</h1>
          <p className="text-white text-xl">Collaborate, code, and build together in real-time.</p>
        </div>
        
        <div className="bg-blue-900/30 backdrop-blur-sm p-8 rounded-lg w-full max-w-md border border-blue-700/50">
          {/* Username input */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 bg-blue-800/50 text-white rounded-lg border border-blue-600 focus:border-blue-400 focus:outline-none"
            />
          </div>
          
          {/* Create Room Section */}
          <div className="mb-6">
            <h2 className="text-xl text-green-400 mb-3 text-center">Create New Room</h2>
            <input
              type="text"
              placeholder="Enter Room Name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full p-3 mb-3 bg-blue-800/50 text-white rounded-lg border border-blue-600 focus:border-blue-400 focus:outline-none"
            />
            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded flex items-center justify-center"
            >
              {isCreating ? 'Creating...' : '+ Create Room'}
            </button>
          </div>
          
          {/* Join Room Section */}
          <div>
            <h2 className="text-xl text-green-400 mb-3 text-center">Join Existing Room</h2>
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full p-3 mb-3 bg-blue-800/50 text-white rounded-lg border border-blue-600 focus:border-blue-400 focus:outline-none"
            />
            <button
              onClick={handleJoinRoom}
              disabled={isJoining}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded flex items-center justify-center"
            >
              {isJoining ? 'Joining...' : '→ Join Room'}
            </button>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/70 text-white rounded-lg text-center">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}