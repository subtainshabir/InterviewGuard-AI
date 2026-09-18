import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const CameraVideo = forwardRef(function CameraVideo({ stream }, forwardedRef) {
  const videoRef = useRef(null);

  useImperativeHandle(forwardedRef, () => videoRef.current, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  return <video ref={videoRef} className="camera-video" playsInline muted autoPlay />;
});

export default CameraVideo;