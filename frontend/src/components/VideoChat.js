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

  useEffect(() => {
    clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    return () => leaveChannel();
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
      videoTrack.setEnabled(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    const audioTrack = localTrackRef.current.audioTrack;
    if (audioTrack) {
      audioTrack.setEnabled(!audioEnabled);
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

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
      {/* Video Area */}
      <div className="flex justify-center items-center gap-4 w-full px-4 flex-wrap mt-6">
        {/* Local Video */}
        <div className="relative w-[380px] h-[280px] bg-black rounded-lg shadow-lg overflow-hidden border border-blue-500">
          <div ref={localVideoRef} className="w-full h-full object-cover" />
          <span className="absolute bottom-2 left-2 text-sm bg-black bg-opacity-50 px-2 py-1 rounded text-white">
            You
          </span>
        </div>

        {/* Remote Video */}
        <div className="relative w-[380px] h-[280px] bg-black rounded-lg shadow-lg overflow-hidden border border-green-500">
          <div ref={remoteVideoRef} className="w-full h-full object-cover" />
          <span className="absolute bottom-2 left-2 text-sm bg-black bg-opacity-50 px-2 py-1 rounded text-white">
            Remote
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 bg-gray-800 rounded-full py-2 px-6 flex gap-4 justify-center items-center shadow-lg">
        {!joined ? (
          <button
            onClick={joinChannel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full transition"
          >
            Join
          </button>
        ) : (
          <>
            <button
              onClick={leaveChannel}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-full transition"
            >
              Leave
            </button>
            <button
              onClick={toggleVideo}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-full transition"
            >
              {videoEnabled ? 'Video Off' : 'Video On'}
            </button>
            <button
              onClick={toggleAudio}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-black rounded-full transition"
            >
              {audioEnabled ? 'Mute' : 'Unmute'}
            </button>
            <button
              onClick={shareScreen}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-full transition"
            >
              Share Screen
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AgoraVideoChat;
