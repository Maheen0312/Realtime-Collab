import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

const Home = () => {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [socket, setSocket] = useState(null);
  const navigate = useNavigate();
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState('');

  // Load username from localStorage
  useEffect(() => {
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

  // Initialize socket connection only once
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || '');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setConnectionError(err.message);
      toast.error('Failed to connect to server');
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const saveUsername = (name) => {
    localStorage.setItem('username', name);
  };

  const joinRoom = async (roomIdToJoin, isHost = false) => {
    if (!socket) {
      setError('Socket not connected. Please refresh the page.');
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, 5000);

      const onRoomJoined = (data) => {
        cleanup();
        resolve(data);
      };

      const onRoomNotFound = () => {
        cleanup();
        resolve({ status: 'not_found' });
      };

      const onError = (err) => {
        cleanup();
        reject(new Error(err.message || 'Socket error'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('room-joined', onRoomJoined);
        socket.off('room-not-found', onRoomNotFound);
        socket.off('error', onError);
      };

      socket.once('room-joined', onRoomJoined);
      socket.once('room-not-found', onRoomNotFound);
      socket.once('error', onError);

      socket.emit('join-room', {
        roomId: roomIdToJoin,
        user: { name: username, isHost },
      });
    });
  };

  const handleJoinRoom = async () => {
    if (!roomId || !username) {
      setError('Room ID and username are required');
      return;
    }

    setError('');
    setIsJoining(true);
    saveUsername(username);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/check-room/${roomId}`);
      const data = await response.json();
      let joinResult;

      if (response.ok && data.exists) {
        joinResult = await joinRoom(roomId, false);
      } else {
        console.log('Room not found. Trying to create it...');
        joinResult = await joinRoom(roomId, true);
      }

      if (joinResult.success) {
        toast.success('Successfully joined the room!');
        navigate(`/room/${newRoomId}?username=${encodeURIComponent(username)}`);
      } else if (joinResult.status === 'not_found') {
        setError('Room not found or has expired');
        toast.error('Room not found');
      }
    } catch (err) {
      console.error('Join error:', err);
      setError(`Error joining room: ${err.message}`);
      toast.error('Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

 const handleCreateRoom = async () => {
  if (!roomName || !username) {
    setError('Room name and username are required');
    return;
  }

  setError('');
  setIsCreating(true);
  saveUsername(username);

  try {
    const newRoomId = uuidv4(); // ✅ Define it here
    const result = await joinRoom(newRoomId, true);

    if (result.success) {
      localStorage.setItem(`room_${newRoomId}_name`, roomName);
      toast.success('Room created successfully!');
      navigate(`/editor/${newRoomId}?username=${encodeURIComponent(username)}`);
    }
  } catch (err) {
    console.error('Create error:', err);
    setError(`Error creating room: ${err.message}`);
    toast.error('Failed to create room');
  } finally {
    setIsCreating(false);
  }
};


  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/login');
  };

  return (
    <>
      <div className="animated-grainy-bg" />
      <button
        onClick={handleLogout}
        className="z-20 absolute top-6 right-6 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-semibold"
      >
        Logout
      </button>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-white">
        <h1 className="text-5xl font-extrabold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-yellow-400 text-center">
          Realtime Code Collaboration
        </h1>
        <p className="mb-6 text-lg opacity-80 text-center max-w-xl">
          Collaborate, code, and build together in real-time.
        </p>

        <div className="w-full max-w-md mx-auto text-center rounded-2xl p-8 border border-white/20 bg-white/10 backdrop-blur-xl shadow-xl shadow-white/10">
          <input
            type="text"
            placeholder="Enter Your Name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 rounded-lg mb-4 text-white border border-white/20 bg-white/10 backdrop-blur-md placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <div className="border-t border-white/10 my-4 pt-4">
            <h3 className="text-xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-green-400">
              Create New Room
            </h3>
            <input
              type="text"
              placeholder="Enter Room Name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full p-3 rounded-lg mb-4 text-white border border-white/20 bg-white/10 backdrop-blur-md placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg mb-4 font-bold transition-all disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : '+ Create Room'}
            </button>
          </div>

          <div className="border-t border-white/10 my-4 pt-4">
            <h3 className="text-xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-teal-400">
              Join Existing Room
            </h3>
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full p-3 rounded-lg mb-4 text-white border border-white/20 bg-white/10 backdrop-blur-md placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              onClick={handleJoinRoom}
              disabled={isJoining}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-bold transition-all disabled:opacity-50"
            >
              {isJoining ? 'Joining...' : '→ Join Room'}
            </button>
          </div>
        </div>

        {connectionError && (
          <div className="mt-4 text-red-400 text-sm">{`Connection Error: ${connectionError}`}</div>
        )}

        {popupMessage && (
          <div
            className={`fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-white backdrop-blur-md ${
              popupType === 'success' ? 'bg-green-500/80' : 'bg-red-500/80'
            }`}
          >
            {popupMessage}
          </div>
        )}
      </div>
    </>
  );
};

export default Home;
