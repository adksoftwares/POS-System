import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';
import './BarcodeCameraScanner.css';

export default function BarcodeCameraScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState('');
  const [isScanning, setIsScanning] = useState(true);

  // Load available video input devices
  useEffect(() => {
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        if (videoDevices.length > 0) {
          // Default to the last one (usually back camera on mobile or default webcam on PC)
          setActiveCameraId(videoDevices[videoDevices.length - 1].deviceId);
        }
      } catch (err) {
        console.error("Failed to enumerate cameras:", err);
      }
    }
    getCameras();
  }, []);

  // Initialize and stream camera feed
  useEffect(() => {
    if (!activeCameraId) return;

    let activeStream = null;

    async function startStream() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      try {
        setErrorMsg('');
        const constraints = {
          video: {
            deviceId: { exact: activeCameraId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true); // required for iOS
          videoRef.current.play().catch(e => console.log("Video play deferred:", e));
        }
        streamRef.current = stream;
        activeStream = stream;
      } catch (err) {
        console.error("Camera access failed:", err);
        setErrorMsg("Failed to access camera. Please ensure permissions are granted.");
      }
    }

    startStream();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeCameraId]);

  // Real-time detection loop
  useEffect(() => {
    let animationFrameId = null;
    let detector = null;

    if ('BarcodeDetector' in window) {
      try {
        // Native barcode detector supported formats
        detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code']
        });
      } catch (e) {
        console.error("Failed to initialize native BarcodeDetector:", e);
      }
    } else {
      console.warn("BarcodeDetector is not supported in this browser. Falling back to mock barcode generator for simulation.");
    }

    async function scanLoop() {
      if (!isScanning) return;
      
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              setIsScanning(false);
              onScan(code);
              return;
            }
          } catch (err) {
            console.error("Detection error:", err);
          }
        }
      }
      animationFrameId = requestAnimationFrame(scanLoop);
    }

    if (isScanning) {
      animationFrameId = requestAnimationFrame(scanLoop);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isScanning, onScan]);

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.deviceId === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setActiveCameraId(cameras[nextIndex].deviceId);
  };

  // Mock scan trigger for systems without native BarcodeDetector or cameras (great fallback for testing)
  const handleMockScan = () => {
    const mockCodes = ['123', '124', '125', '8801043014847', '9780201379624'];
    const randomCode = mockCodes[Math.floor(Math.random() * mockCodes.length)];
    setIsScanning(false);
    onScan(randomCode);
  };

  return (
    <div className="barcode-scanner-overlay">
      <div className="barcode-scanner-card glass-panel animate-scale-in">
        <div className="scanner-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Camera size={22} className="pulse-icon" />
            <h3 style={{ margin: 0, fontWeight: 'bold' }}>Scan Barcode via Camera</h3>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="scanner-viewport-container">
          {errorMsg ? (
            <div className="scanner-error">{errorMsg}</div>
          ) : (
            <video ref={videoRef} className="scanner-video" muted />
          )}
          <div className="scanner-overlay-laser"></div>
          <div className="scanner-overlay-corners"></div>
        </div>

        {cameras.length > 1 && (
          <button type="button" className="btn btn-secondary btn-switch-camera" onClick={switchCamera} style={{ marginTop: '1rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <RefreshCw size={16} /> Switch Camera
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Position the barcode clearly inside the camera viewport to scan automatically.
          </p>
          
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleMockScan} 
            style={{ 
              fontSize: '0.8rem', 
              padding: '0.4rem', 
              opacity: 0.7, 
              alignSelf: 'center',
              marginTop: '0.5rem'
            }}
          >
            [Developer Sandbox] Simulate Scan
          </button>
        </div>
      </div>
    </div>
  );
}
