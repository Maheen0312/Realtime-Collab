import React, { useEffect, useRef, useState } from "react";
import { BsCameraVideo, BsCameraVideoOff, BsMic, BsMicMute, BsDisplay } from "react-icons/bs";
import Peer from "simple-peer";

const VideoChat = ({ socket, roomId, userId, participants }) => {
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);

  const myVideoRef = useRef();
  const peersRef = useRef({});

  useEffect(() => {
    const getMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(mediaStream);
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.error("Failed to access media devices:", error);
      }
    };

    getMedia();

    if (socket) {
      if (socket.connected) {
        socket.emit("join-room", { roomId, user: { name: userId } });
      } else {
        const handleConnect = () => {
          socket.emit("join-room", { roomId, user: { name: userId } });
          socket.off("connect", handleConnect);
        };
        socket.on("connect", handleConnect);
      }
    }

    return () => {
      if (socket) socket.emit("leave-room", { roomId });
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [socket, roomId, userId]);

  useEffect(() => {
    if (!socket || !stream) return;

    const handleRoomParticipants = (participantsList) => {
      participantsList.forEach((participant) => {
        if (participant.socketId !== socket.id && !peersRef.current[participant.socketId]) {
          const peer = createPeer(participant.socketId, socket.id, stream);
          peersRef.current[participant.socketId] = peer;
          setPeers((prev) => ({ ...prev, [participant.socketId]: peer }));
        }
      });
    };

    const handleUserJoined = ({ newUserId }) => {
      if (!peersRef.current[newUserId]) {
        const peer = createPeer(newUserId, socket.id, stream);
        peersRef.current[newUserId] = peer;
        setPeers((prev) => ({ ...prev, [newUserId]: peer }));
      }
    };

    const handleReceiveSignal = ({ from, signal }) => {
      if (!peersRef.current[from]) {
        const peer = addPeer(signal, from, stream);
        peersRef.current[from] = peer;
        setPeers((prev) => ({ ...prev, [from]: peer }));
      } else {
        peersRef.current[from].signal(signal);
      }
    };

    const handleUserDisconnected = ({ userId: disconnectedUserId }) => {
      if (peersRef.current[disconnectedUserId]) {
        peersRef.current[disconnectedUserId].destroy();
        delete peersRef.current[disconnectedUserId];
        setPeers((prev) => {
          const updated = { ...prev };
          delete updated[disconnectedUserId];
          return updated;
        });
      }
    };

    socket.on("room-participants", handleRoomParticipants);
    socket.on("user-joined", handleUserJoined);
    socket.on("receive-signal", handleReceiveSignal);
    socket.on("user-disconnected", handleUserDisconnected);

    return () => {
      socket.off("room-participants", handleRoomParticipants);
      socket.off("user-joined", handleUserJoined);
      socket.off("receive-signal", handleReceiveSignal);
      socket.off("user-disconnected", handleUserDisconnected);
    };
  }, [socket, stream]);

  const createPeer = (userToSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("send-signal", { userToSignal, from: callerId, signal });
    });

    peer.on("stream", (peerStream) => {
      setPeers((prevPeers) => {
        return { ...prevPeers, [userToSignal]: peerStream };
      });
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("send-signal", { userToSignal: callerId, from: socket.id, signal });
    });

    peer.signal(incomingSignal);

    peer.on("stream", (peerStream) => {
      setPeers((prevPeers) => {
        return { ...prevPeers, [callerId]: peerStream };
      });
    });

    return peer;
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getTracks()[0];

      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer._pc.getSenders().find((s) => s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = screenStream;
      }

      screenTrack.onended = () => {
        window.location.reload();
      };
    } catch (err) {
      console.error("Screen sharing error:", err);
    }
  };

  const totalUsers = Object.keys(peers).length + 1;

  const getGridClass = () => {
    const users = totalUsers;
    if (users === 1) return "grid-cols-1";
    if (users === 2) return "grid-cols-2";
    if (users <= 4) return "grid-cols-2";
    if (users <= 6) return "grid-cols-3";
    return "grid-cols-4";
  };

  return (
    <div className="w-full flex flex-col items-center bg-gray-900 p-4 rounded-lg mb-4">
      <h3 className="text-white text-lg font-bold mb-3">Video Chat</h3>

      <div className={`grid ${getGridClass()} gap-2 mb-4 w-full max-w-5xl`}>
        {/* My Video */}
        <div className="relative mb-2">
          <video
            ref={myVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-40 sm:h-56 md:h-64 bg-black rounded-lg object-cover"
          />
          <div className="absolute bottom-0 w-full text-center bg-black bg-opacity-70 text-white text-xs py-1 rounded-b-lg">
            You ({userId})
          </div>
        </div>

        {/* Remote Videos */}
        {Object.entries(peers).map(([peerId, peerStream]) => (
          <div key={peerId} className="relative mb-2">
            <video
              autoPlay
              playsInline
              srcObject={peerStream}
              className="w-full h-40 sm:h-56 md:h-64 bg-black rounded-lg object-cover"
            />
            <div className="absolute bottom-0 w-full text-center bg-black bg-opacity-70 text-white text-xs py-1 rounded-b-lg">
              {participants[peerId] || "Unknown"}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex space-x-4 mt-2">
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full text-white ${isVideoOn ? "bg-green-600" : "bg-red-600"}`}
          title={isVideoOn ? "Turn camera off" : "Turn camera on"}
        >
          {isVideoOn ? <BsCameraVideo size={20} /> : <BsCameraVideoOff size={20} />}
        </button>
        <button
          onClick={toggleAudio}
          className={`p-3 rounded-full text-white ${isAudioOn ? "bg-green-600" : "bg-red-600"}`}
          title={isAudioOn ? "Mute microphone" : "Unmute microphone"}
        >
          {isAudioOn ? <BsMic size={20} /> : <BsMicMute size={20} />}
        </button>
        <button
          onClick={startScreenShare}
          className="p-3 rounded-full bg-blue-600 text-white"
          title="Share screen"
        >
          <BsDisplay size={20} />
        </button>
      </div>

      <div className="text-white text-xs mt-4">
        Connected users: {totalUsers} ({1} you + {totalUsers - 1} others)
      </div>
    </div>
  );
};

export default VideoChat;
