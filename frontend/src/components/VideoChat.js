import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { v4 as uuidV4 } from 'uuid';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import socket from '../socket';  // Adjust path if needed

const VideoChat = ({ roomId, userId }) => {
  const myVideoRef = useRef(null);
  const videoContainerRef = useRef(null);
  const [peer, setPeer] = useState(null);
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  useEffect(() => {
    // Initialize PeerJS peer object with either a given userId or a generated one
    const newPeer = new Peer(userId || uuidV4());
    setPeer(newPeer);

    // Attempt to get user media (camera + mic)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(currentStream => {
      setStream(currentStream);

      // Set local stream to the video element
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = currentStream;
      }

      // Emit the join-room event to the socket server
      socket.emit('join-room', roomId, newPeer.id);

      // PeerJS event for incoming calls
      newPeer.on('call', call => {
        call.answer(currentStream);  // Answer the incoming call
        const video = document.createElement('video');
        video.playsInline = true;
        call.on('stream', remoteStream => {
          addVideoStream(video, remoteStream, call.peer); // Add the remote stream
        });
      });

      // Listen for other users connecting
      socket.on('user-connected', userId => {
        connectToNewUser(userId, currentStream, newPeer);
      });

      // Handle disconnection
      socket.on('user-disconnected', userId => {
        if (peers[userId]) {
          peers[userId].close();
          removeVideoStream(userId);
        }
      });
    });

    return () => {
      socket.disconnect();
      newPeer.destroy();
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);  // Empty dependency array ensures this effect runs once on mount

  // Connect to a new user when they join the room
  const connectToNewUser = (userId, stream, peer) => {
    const call = peer.call(userId, stream);  // Start a new call with the new user
    const video = document.createElement('video');
    video.playsInline = true;
    call.on('stream', remoteStream => {
      addVideoStream(video, remoteStream, userId);
    });
    call.on('close', () => {
      removeVideoStream(userId);  // Remove video stream when call is closed
    });

    setPeers(prev => ({ ...prev, [userId]: call }));
  };

  // Add a remote video stream to the video container
  const addVideoStream = (video, stream, id) => {
    video.srcObject = stream;
    video.id = id;
    video.className = 'w-40 h-32 object-cover rounded-md border border-gray-700';
    video.autoplay = true;
    video.muted = false;

    // Check if video already exists in DOM before adding
    if (videoContainerRef.current && !document.getElementById(id)) {
      videoContainerRef.current.appendChild(video);
    }
  };

  // Remove video stream from the DOM
  const removeVideoStream = (userId) => {
    const video = document.getElementById(userId);
    if (video) video.remove();
  };

  // Toggle microphone on/off
  const toggleMic = () => {
    stream.getAudioTracks().forEach(track => (track.enabled = !track.enabled));
    setMicEnabled(!micEnabled);
  };

  // Toggle camera on/off
  const toggleCamera = () => {
    stream.getVideoTracks().forEach(track => (track.enabled = !track.enabled));
    setCameraEnabled(!cameraEnabled);
  };

  return (
    <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-80 p-3 rounded-xl shadow-lg z-50 w-72">
      {/* Local video */}
      <div ref={videoContainerRef} className="grid grid-cols-2 gap-2 mb-2">
        <video
          ref={myVideoRef}
          muted
          autoPlay
          playsInline
          className="w-40 h-32 object-cover rounded-md border border-gray-700"
        />
      </div>
      {/* Controls */}
      <div className="flex justify-around mt-2">
        <button onClick={toggleMic} className="text-white hover:text-red-500">
          {micEnabled ? <FaMicrophone size={20} /> : <FaMicrophoneSlash size={20} />}
        </button>
        <button onClick={toggleCamera} className="text-white hover:text-red-500">
          {cameraEnabled ? <FaVideo size={20} /> : <FaVideoSlash size={20} />}
        </button>
      </div>
    </div>
  );
};

export default VideoChat;
