// VideoChat.js

import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { v4 as uuidV4 } from 'uuid';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import socket from '../socket'; // Adjust path if needed

const VideoChat = ({ roomId, userId }) => {
  const myVideoRef = useRef(null);
  const videoContainerRef = useRef(null);
  const [peer, setPeer] = useState(null);
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  useEffect(() => {
    const newPeer = new Peer(userId || uuidV4());
    setPeer(newPeer);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(currentStream => {
      setStream(currentStream);

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = currentStream;
      }

      socket.emit('join-room', roomId, newPeer.id);

      newPeer.on('call', call => {
        call.answer(currentStream);
        const video = document.createElement('video');
        video.playsInline = true;
        call.on('stream', remoteStream => {
          addVideoStream(video, remoteStream, call.peer);
        });
      });

      socket.on('user-connected', userId => {
        connectToNewUser(userId, currentStream, newPeer);
      });

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
  }, []);

  const connectToNewUser = (userId, stream, peer) => {
    const call = peer.call(userId, stream);
    const video = document.createElement('video');
    video.playsInline = true;
    call.on('stream', remoteStream => {
      addVideoStream(video, remoteStream, userId);
    });
    call.on('close', () => {
      removeVideoStream(userId);
    });

    setPeers(prev => ({ ...prev, [userId]: call }));
  };

  const addVideoStream = (video, stream, id) => {
    video.srcObject = stream;
    video.id = id;
    video.className = 'w-40 h-32 object-cover rounded-md border border-gray-700';
    video.autoplay = true;
    video.muted = false;
    if (videoContainerRef.current && !document.getElementById(id)) {
      videoContainerRef.current.appendChild(video);
    }
  };

  const removeVideoStream = (userId) => {
    const video = document.getElementById(userId);
    if (video) video.remove();
  };

  const toggleMic = () => {
    stream.getAudioTracks().forEach(track => (track.enabled = !track.enabled));
    setMicEnabled(!micEnabled);
  };

  const toggleCamera = () => {
    stream.getVideoTracks().forEach(track => (track.enabled = !track.enabled));
    setCameraEnabled(!cameraEnabled);
  };

  return (
    <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-80 p-3 rounded-xl shadow-lg z-50 w-72">
      <div ref={videoContainerRef} className="grid grid-cols-2 gap-2 mb-2">
        <video
          ref={myVideoRef}
          muted
          autoPlay
          playsInline
          className="w-40 h-32 object-cover rounded-md border border-gray-700"
        />
      </div>
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
