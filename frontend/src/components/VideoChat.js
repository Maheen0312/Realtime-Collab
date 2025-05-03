import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';

const APP_ID = '712f72b0c5ed413299df9bab345526f3';
const TOKEN = '007eJxTYIi/ofH43AvByd8+LYhgZ3ZTZ4vi2Xaaf90+vdlO92NVvy1XYDA3NEozN0oySDZNTTExNDaytExJs0xKTDI2MTU1MkszvrBHNKMhkJFB+9RXVkYGCATxORhKUotLivLzcxkYAMryIVw=';
const CHANNEL = 'testroom'; // You can make this dynamic if needed

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

    // Wait for DOM to be ready
    setTimeout(() => {
      if (localVideoRef.current) {
        videoTrack.play(localVideoRef.current);
      }
    }, 100);

    await client.publish([audioTrack, videoTrack]);

    setJoined(true);

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);

      if (mediaType === 'video') {
        setTimeout(() => {
          if (remoteVideoRef.current) {
            user.videoTrack.play(remoteVideoRef.current);
          }
        }, 100);
      }

      if (mediaType === 'audio') {
        user.audioTrack.play();
      }
    });

    client.on('user-unpublished', (user) => {
      if (user.videoTrack) {
        user.videoTrack.stop();
      }
      if (user.audioTrack) {
        user.audioTrack.stop();
      }
    });
  };

  const leaveChannel = async () => {
    const client = clientRef.current;
    const { audioTrack, videoTrack } = localTrackRef.current;

    if (audioTrack) {
      audioTrack.stop();
      audioTrack.close();
    }

    if (videoTrack) {
      videoTrack.stop();
      videoTrack.close();
    }

    await client.leave();
    setJoined(false);
  };

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4">Agora Video Chat</h2>
      <div className="flex space-x-4 mb-4">
        <div>
          <h3 className="mb-2">Local</h3>
          <div
            ref={localVideoRef}
            className="w-64 h-48 bg-black overflow-hidden rounded"
          />
        </div>
        <div>
          <h3 className="mb-2">Remote</h3>
          <div
            ref={remoteVideoRef}
            className="w-64 h-48 bg-black overflow-hidden rounded"
          />
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
