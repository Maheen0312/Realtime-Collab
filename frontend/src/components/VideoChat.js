// src/components/AgoraVideoChat.jsx
import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';

const APP_ID = '712f72b0c5ed413299df9bab345526f3';
const TOKEN = '6ed91906cf0842a5b6e693bde9b8d208'; // or null if app certificate is disabled
const CHANNEL = 'testroom'; // or dynamic per room

const AgoraVideoChat = () => {
  const [joined, setJoined] = useState(false);
  const clientRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localTrackRef = useRef({});

  useEffect(() => {
    clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    return () => {
      leaveChannel();
    };
  }, []);

  const joinChannel = async () => {
    const client = clientRef.current;

    await client.join(APP_ID, CHANNEL, TOKEN, null);

    const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
    localTrackRef.current = { audioTrack, videoTrack };

    // Play local stream
    videoTrack.play(localVideoRef.current);

    await client.publish([audioTrack, videoTrack]);

    setJoined(true);

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === 'video') {
        user.videoTrack.play(remoteVideoRef.current);
      }
      if (mediaType === 'audio') {
        user.audioTrack.play();
      }
    });
  };

  const leaveChannel = async () => {
    const client = clientRef.current;
    const { audioTrack, videoTrack } = localTrackRef.current;

    if (audioTrack) audioTrack.stop();
    if (videoTrack) videoTrack.stop();

    await client.leave();
    setJoined(false);
  };

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4">Agora Video Chat</h2>
      <div className="flex space-x-4 mb-4">
        <div>
          <h3 className="mb-2">Local</h3>
          <div ref={localVideoRef} className="w-64 h-48 bg-black" />
        </div>
        <div>
          <h3 className="mb-2">Remote</h3>
          <div ref={remoteVideoRef} className="w-64 h-48 bg-black" />
        </div>
      </div>
      <div>
        {!joined ? (
          <button
            onClick={joinChannel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
          >
            Join Video Chat
          </button>
        ) : (
          <button
            onClick={leaveChannel}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
          >
            Leave Video Chat
          </button>
        )}
      </div>
    </div>
  );
};

export default AgoraVideoChat;
