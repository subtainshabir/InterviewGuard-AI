import { Fragment, useEffect, useRef, useState } from "react";

export default function FaceOverlay({ videoRef, faces }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const video = videoRef.current;
  const videoWidth = video?.videoWidth || 0;
  const videoHeight = video?.videoHeight || 0;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (videoWidth > 0 && videoHeight > 0 && size.width > 0 && size.height > 0) {
    // object-fit: cover uses the larger of the two ratios so the video fully fills the box.
    scale = Math.max(size.width / videoWidth, size.height / videoHeight);
    offsetX = (size.width - videoWidth * scale) / 2;
    offsetY = (size.height - videoHeight * scale) / 2;
  }

  return (
    <div ref={containerRef} className="face-overlay" aria-hidden="true">
      {videoWidth > 0 &&
        faces.map((face) => {
          const { x, y, width, height } = face.boundingBox;
          return (
            <Fragment key={face.id}>
              <div
                className="face-box"
                style={{
                  left: `${x * scale + offsetX}px`,
                  top: `${y * scale + offsetY}px`,
                  width: `${width * scale}px`,
                  height: `${height * scale}px`,
                }}
              >
                <span className="face-box-label">{Math.round(face.confidence * 100)}%</span>
              </div>
              {face.landmarks?.points.map((point, index) => (
                <span
                  key={index}
                  className="face-landmark-dot"
                  style={{
                    left: `${point.x * scale + offsetX}px`,
                    top: `${point.y * scale + offsetY}px`,
                  }}
                />
              ))}
            </Fragment>
          );
        })}
    </div>
  );
}