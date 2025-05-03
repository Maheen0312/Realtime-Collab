import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';

const APP_ID = '712f72b0c5ed413299df9bab345526f3';
const TOKEN = '007eJxTYIi/ofH43AvByd8+LYhgZ3ZTZ4vi2Xaaf90+vdlO92NVvy1XYDA3NEozN0oySDZNTTExNDaytExJs0xKTDI2MTU1MkszvrBHNKMhkJFB+9RXVkYGCATxORhKUotLivLzcxkYAMryIVw=';
const CHANNEL = 'testroom';

const AgoraVideoChat = () => {
  const [joined, setJoined] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const clientRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localTrackRef = useRef({});

  const positionRef = useRef({ x: 0, y: 0 });

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

    client.on('user-unpublished', (user) => {
      if (user.videoTrack) user.videoTrack.stop();
      if (user.audioTrack) user.audioTrack.stop();
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

  const toggleVideo = () => {
    const videoTrack = localTrackRef.current.videoTrack;
    if (videoTrack) {
      videoEnabled ? videoTrack.setEnabled(false) : videoTrack.setEnabled(true);
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    const audioTrack = localTrackRef.current.audioTrack;
    if (audioTrack) {
      audioEnabled ? audioTrack.setEnabled(false) : audioTrack.setEnabled(true);
      setAudioEnabled(!audioEnabled);
    }
  };

  const shareScreen = async () => {
    if (isScreenSharing) return;

    const screenTrack = await AgoraRTC.createScreenVideoTrack();
    await clientRef.current.unpublish(localTrackRef.current.videoTrack);

    localTrackRef.current.videoTrack.stop();
    localTrackRef.current.videoTrack.close();

    localTrackRef.current.videoTrack = screenTrack;
    await clientRef.current.publish(screenTrack);
    screenTrack.play(localVideoRef.current);

    setIsScreenSharing(true);

    screenTrack.on('track-ended', async () => {
      await clientRef.current.unpublish(screenTrack);
      screenTrack.stop();
      screenTrack.close();

      const camTrack = await AgoraRTC.createCameraVideoTrack();
      localTrackRef.current.videoTrack = camTrack;
      await clientRef.current.publish(camTrack);
      camTrack.play(localVideoRef.current);

      setIsScreenSharing(false);
    });
  };

  const onDrag = (e) => {
    const box = e.target;
    const x = e.clientX - positionRef.current.x;
    const y = e.clientY - positionRef.current.y;
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  };

  const onMouseDown = (e) => {
    positionRef.current.x = e.clientX - e.target.offsetLeft;
    positionRef.current.y = e.clientY - e.target.offsetTop;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onDrag);
    }, { once: true });
  };

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg relative">
      <h2 className="text-xl font-bold mb-4">Agora Video Chat</h2>
  
      <div className="mb-4">
        {!joined ? (
          <button onClick={joinChannel} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded mr-2">
            Join Video Chat
          </button>
        ) : (
          <button onClick={leaveChannel} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded mr-2">
            Leave Video Chat
          </button>
        )}
  
        {joined && (
          <>
            <button onClick={toggleVideo} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded mr-2">
              {videoEnabled ? 'Turn Video Off' : 'Turn Video On'}
            </button>
            <button onClick={toggleAudio} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded mr-2">
              {audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
            </button>
            <button onClick={shareScreen} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded">
              Share Screen
            </button>
          </>
        )}
      </div>
  
      <div className="w-full h-[500px] flex items-center justify-center relative">
        <div
          ref={localVideoRef}
          onMouseDown={onMouseDown}
          className="absolute w-80 h-60 bg-gray-800 rounded-lg shadow-lg cursor-move top-4 left-4 z-20 border-2 border-blue-500"
        />
  
        <div
          ref={remoteVideoRef}
          className="absolute right-4 bottom-4 w-80 h-60 bg-gray-800 rounded-lg shadow-lg border-2 border-green-500"
        />
      </div>
    </div>
  );
};

export default AgoraVideoChat;
