import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';

import {
  CameraOutlined,
  CameraTwoTone,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  ScanOutlined,
  StopOutlined,
  UsbOutlined,
  UserAddOutlined,
  UserOutlined,
  VideoCameraOutlined,
  WarningOutlined,
  WifiOutlined,
} from '@ant-design/icons';

import api from '../api/client';

/* =========================================================
   ESP32-CAM SETTINGS

   The camera is proxied by the Node backend (/api/v1/esp32/*) - the
   browser never talks to the ESP32 directly (CORS + mixed endpoints).
   Camera IP lives in backend/.env as ESP32_CAM_URL.
   ========================================================= */

const API_ORIGIN =
  (import.meta.env.VITE_API_URL || '')
    .replace(/\/api\/v1\/?$/, '');

const ESP32_STREAM_URL = `${API_ORIGIN}/api/v1/esp32/stream`;
const ESP32_CAPTURE_URL = `${API_ORIGIN}/api/v1/esp32/capture`;
const ESP32_HEALTH_URL = `${API_ORIGIN}/api/v1/esp32/health`;

/* =========================================================
   IMAGE / SCAN SETTINGS
   ========================================================= */

const MAX_FRAME_W = 960;
const DETECT_FRAME_W = 640;

const SCAN_FRAMES = 3;
const FRAME_GAP_MS = 140;

const DETECT_MS = 1000;
const REARM_TICKS = 3;
const DISAPPEARANCE_TICKS = 4;
const SCAN_COOLDOWN_MS = 15000;

const AUTO_LABEL = {
  off: 'Automatic scanning is off',
  looking: 'Looking for a passenger — please look at the camera',
  waiting: 'Passenger verified — boarding recorded',
  scanning: 'Face detected — verifying boarding eligibility...',
};

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================================
   HELPERS
   ========================================================= */

const CONF = (c) =>
  typeof c === 'number'
    ? `${(c * 100).toFixed(1)}%`
    : '-';

const mediaUrl = (url) =>
  !url
    ? ''
    : /^https?:/i.test(url)
      ? url
      : `${API_ORIGIN}${url}`;

/* =========================================================
   ICON
   ========================================================= */

const OutcomeIcon = ({ status }) => {
  if (status === 'paid_ignored' || status === 'already_recorded') {
    return (
      <CheckCircleOutlined
        style={{ color: '#10b981' }}
      />
    );
  }

  if (status === 'unpaid_recorded') {
    return (
      <WarningOutlined
        style={{ color: '#ef4444' }}
      />
    );
  }

  if (status === 'registered') {
    return (
      <UserAddOutlined
        style={{ color: '#6366f1' }}
      />
    );
  }

  return (
    <CloseCircleOutlined
      style={{ color: '#f59e0b' }}
    />
  );
};

/* =========================================================
   FACE SCAN COMPONENT
   ========================================================= */

const FaceScan = () => {
  const [mode, setMode] = useState('scan');

  const [buses, setBuses] = useState([]);
  const [students, setStudents] = useState([]);

  const [busId, setBusId] = useState();
  const [registerStudentId, setRegisterStudentId] = useState();

  // Camera Source: 'webcam' | 'wired' | 'wireless'
  const [cameraSource, setCameraSource] = useState('webcam');
  const [wiredBaud, setWiredBaud] = useState(1000000);
  const [wiredConnected, setWiredConnected] = useState(false);
  const [wiredFps, setWiredFps] = useState(0);

  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const [ai, setAi] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const [cameraError, setCameraError] = useState('');

  // bumped to remount the <img> when reconnecting to the proxy
  const [streamKey, setStreamKey] = useState(0);
  const streamRetryRef = useRef(null);

  // camera address controls (ESP32-CAM IP can change - no .env edit needed)
  const [cameraUrl, setCameraUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraMsg, setCameraMsg] = useState('');

  /* =======================================================
     HARDWARE REFS (Webcam + Wired Serial)
     ======================================================= */
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const wiredImgRef = useRef(null);
  const lastWiredFrameRef = useRef(null);
  const wiredPrevUrlRef = useRef(null);
  const serialPortRef = useRef(null);
  const serialReaderRef = useRef(null);
  const serialActiveRef = useRef(false);

  /* =======================================================
     SCAN STATE REFS
     ======================================================= */

  const armedRef = useRef(true);
  const absentRef = useRef(0);
  const cooldownRef = useRef(0);
  const activeStudentLockRef = useRef(null);
  const busyRef = useRef(false);
  const hintRef = useRef(false);
  const errorRef = useRef(0);

  const [auto, setAuto] = useState('off');

  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  useEffect(() => {
    fetchBuses();
    fetchStudents();
    checkAi();
    loadCameraConfig();

    return () => {
      // Cleanup camera streams / serial on unmount
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      serialActiveRef.current = false;
      if (serialReaderRef.current) {
        serialReaderRef.current.cancel().catch(() => {});
      }
      if (serialPortRef.current) {
        serialPortRef.current.close().catch(() => {});
      }
      if (wiredPrevUrlRef.current) {
        URL.revokeObjectURL(wiredPrevUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cameraOn && cameraSource === 'webcam' && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn, cameraSource]);

  /* =======================================================
     CAMERA ADDRESS (runtime config + LAN discovery)
     ======================================================= */

  const loadCameraConfig = async () => {
    try {
      const res = await api.get('/esp32/config');
      setCameraUrl(res.data?.url || '');
    } catch (e) {
      // non-fatal - the field just stays empty
    }
  };

  const findCamera = async () => {
    setScanning(true);
    setCameraMsg('');
    try {
      const res = await api.get('/esp32/scan');
      const found = res.data?.candidates || [];
      if (found.length === 1) {
        setCameraUrl(found[0].url);
        setCameraMsg(`Found camera at ${found[0].url} - click Apply.`);
      } else if (found.length > 1) {
        setCameraUrl(found[0].url);
        setCameraMsg(
          `Found ${found.length} candidates: ${found.map((c) => c.url).join(', ')} - using ${found[0].url}. Click Apply.`
        );
      } else {
        setCameraMsg('No camera found on the local network. Check power / Wi-Fi.');
      }
    } catch (e) {
      setCameraMsg(e.response?.data?.message || e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const applyCamera = async () => {
    setCameraMsg('');
    setCameraError('');
    try {
      const res = await api.post('/esp32/config', { url: cameraUrl });
      setCameraUrl(res.data?.url || cameraUrl);
      setCameraMsg(`Camera set to ${res.data?.url}. Reconnecting…`);
      if (cameraOn) {
        setStreamLoading(true);
        setStreamReady(false);
        setStreamKey((k) => k + 1);
      }
    } catch (e) {
      setCameraMsg(e.response?.data?.message || e.message || 'Could not set camera');
    }
  };

  /* =======================================================
     AI STATUS
     ======================================================= */

  const checkAi = async () => {
    try {
      const res = await api.get('/face/health');

      setAi(res.data);
    } catch (e) {
      setAi({
        ai: 'offline',
        message: e.message,
      });
    }
  };

  /* =======================================================
     BUS DATA
     ======================================================= */

  const fetchBuses = async () => {
    try {
      const res = await api.get('/buses');

      setBuses(res.data || []);

      if (res.data?.length && !busId) {
        setBusId(res.data[0]._id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  /* =======================================================
     STUDENT DATA
     ======================================================= */

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');

      setStudents(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  /* =======================================================
     CAPTURE A SINGLE FRAME
     
     IMPORTANT:
     We DO NOT fetch /stream here.

     /stream is MJPEG and is only used by the <img>.
     
     For AI capture we use the ESP32-CAM still endpoint.
     ======================================================= */

  const capture = async (
    maxWidth = MAX_FRAME_W
  ) => {
    try {
      // 1) Web Cam Mode: capture directly from the HTML5 video element
      if (cameraSource === 'webcam') {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) {
          return null;
        }
        const scale = Math.min(1, maxWidth / video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      }

      // 2) Wired Arduino Mode: capture from the latest parsed serial frame
      if (cameraSource === 'wired') {
        const img = wiredImgRef.current;
        if (!img || !img.naturalWidth || !img.naturalHeight) {
          return null;
        }
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      }

      // 3) Wireless Arduino Mode: backend proxy capture from ESP32-CAM
      const response = await fetch(
        `${ESP32_CAPTURE_URL}?t=${Date.now()}`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        const detail = await response
          .json()
          .catch(() => null);

        console.warn(
          'ESP32 capture failed:',
          detail?.message || response.status
        );

        return null;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();

      const imageLoaded = new Promise(
        (resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        }
      );

      img.src = objectUrl;
      await imageLoaded;

      const scale = Math.min(
        1,
        maxWidth / img.width
      );

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));

      const context = canvas.getContext('2d');
      context.drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

      URL.revokeObjectURL(objectUrl);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      console.error('Frame capture error:', e);
      return null;
    }
  };

  /* =======================================================
     CAPTURE MULTIPLE FRAMES
     ======================================================= */

  const captureFrames = async (
    count = SCAN_FRAMES
  ) => {
    const frames = [];

    for (let i = 0; i < count; i += 1) {
      const frame = await capture();

      if (frame) {
        frames.push(frame);
      }

      if (i < count - 1) {
        await wait(FRAME_GAP_MS);
      }
    }

    return frames;
  };

  /* =======================================================
     HISTORY
     ======================================================= */

  const pushHistory = (entry) => {
    setHistory((history) => [
      entry,
      ...history,
    ].slice(0, 8));
  };

  /* =======================================================
     FACE SCAN
     ======================================================= */

  const runScan = async (images) => {
    if (!images || !images.length) {
      return;
    }

    if (!busId) {
      message.warning(
        'Select the bus before scanning'
      );

      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const res = await api.post(
        '/face/scan',
        {
          images,
          busId,
        }
      );

      const data = res.data;

      setResult(data);

      pushHistory({
        id: data.logId,
        time: new Date(),
        name:
          data.student
            ? `${data.student.firstName} ${data.student.lastName}`.trim()
            : 'Unknown face',

        status: data.status,

        confidence:
          data.confidence,

        frames:
          data.frames,

        framesTotal:
          data.framesTotal,

        detail:
          data.message,
      });

      if (data.student?._id) {
        activeStudentLockRef.current = {
          studentId: data.student._id,
          name: `${data.student.firstName} ${data.student.lastName}`.trim(),
          recordedAt: Date.now(),
          lastSeenAt: Date.now(),
        };
      }

      if (
        data.status ===
        'unpaid_recorded'
      ) {
        message.error(data.message);
      } else if (
        data.status ===
        'paid_ignored'
      ) {
        message.success(data.message);
      } else if (
        data.status ===
        'already_recorded'
      ) {
        message.info(data.message || 'Student already verified for this appearance.');
      } else {
        message.warning(data.message);
      }
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message;

      setResult({
        status: 'error',
        message: msg,
        matched: false,
      });

      message.error(msg);
    }

    setBusy(false);
  };

  /* =======================================================
     REGISTER FACE
     ======================================================= */

  const handleRegister = async () => {
    if (!cameraOn) {
      return message.warning(
        'Start the camera first'
      );
    }

    if (!registerStudentId) {
      return message.warning(
        'Select the student to register'
      );
    }

    setBusy(true);
    setResult(null);

    try {
      const images =
        await captureFrames(
          SCAN_FRAMES
        );

      if (!images.length) {
        setBusy(false);

        return message.warning(
          'Could not capture a frame'
        );
      }

      const res = await api.post(
        `/face/register/${registerStudentId}`,
        {
          images,
        }
      );

      const student =
        res.data.student;

      const entry = {
        status: 'registered',
        matched: true,

        student: {
          _id: student._id,
          studentId: student.studentId,
          firstName: student.firstName,
          lastName: student.lastName,
          photoUrl: student.photoUrl,
          paymentStatus:
            student.paymentStatus,
        },

        confidence: 1,

        message:
          `${student.firstName} ${student.lastName} face registered`,
      };

      setResult(entry);

      pushHistory({
        id: student._id,
        time: new Date(),

        name:
          `${student.firstName} ${student.lastName}`,

        status: 'registered',

        confidence: 1,

        detail: entry.message,
      });

      message.success(
        entry.message
      );

      fetchStudents();
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message;

      setResult({
        status: 'error',
        message: msg,
        matched: false,
      });

      message.error(msg);
    }

    setBusy(false);
  };

  /* =======================================================
      CAMERA + ESP32 HEALTH
      ======================================================= */

  // asks the backend which ESP32 endpoints answer and turns the
  // probe into a human-readable message
  const probeCamera = async () => {
    try {
      const res = await fetch(ESP32_HEALTH_URL, {
        cache: 'no-store',
      });

      const probe = await res.json().catch(() => null);

      if (probe?.esp32 === 'online') {
        return '';
      }

      const stillOk = probe?.still
        ? Object.entries(probe.still)
            .filter(([, ok]) => ok)
            .map(([path]) => path)
        : [];

      return (
        `ESP32-CAM offline at ${probe?.base || 'camera'} - ` +
        (stillOk.length
          ? `still endpoints ok but no stream (${stillOk.join(', ')})`
          : 'no still or stream endpoint responded') +
        '. Check power / ESP32_CAM_URL in backend/.env'
      );
    } catch {
      return 'Cannot reach backend proxy - is the Node server running?';
    }
  };

  /* =======================================================
      CAMERA LIFECYCLE (Webcam, Wired Arduino, Wireless)
      ======================================================= */

  const handleCameraSourceChange = async (newSource) => {
    if (cameraOn) {
      await stopCamera();
    }
    setCameraSource(newSource);
    setCameraError('');
  };

  const startWebcam = async () => {
    try {
      setCameraError('');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported by your browser');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      message.success('Webcam connected successfully');
    } catch (err) {
      console.error('Webcam error:', err);
      setCameraError(`Webcam error: ${err.message}`);
      message.error('Could not access webcam');
    }
  };

  const startWiredArduino = async () => {
    if (!('serial' in navigator)) {
      const msg =
        'Web Serial API is not supported in this browser. Please open this website in Google Chrome or Microsoft Edge.';
      setCameraError(msg);
      message.error('Web Serial not supported in this browser');
      return;
    }

    try {
      setCameraError('');
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: Number(wiredBaud) });
      serialPortRef.current = port;
      serialActiveRef.current = true;
      setWiredConnected(true);
      setCameraOn(true);
      message.success(
        `Connected to Wired Arduino on USB at ${Number(wiredBaud).toLocaleString()} baud`
      );
      readSerialLoop(port);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('Serial port error:', err);
        setCameraError(`Serial connection failed: ${err.message}`);
        message.error(`Serial connection error: ${err.message}`);
      }
    }
  };

  const readSerialLoop = async (port) => {
    let buffer = new Uint8Array(0);
    const appendBuffer = (chunk) => {
      const combined = new Uint8Array(buffer.length + chunk.length);
      combined.set(buffer, 0);
      combined.set(chunk, buffer.length);
      return combined;
    };

    let frameCount = 0;
    let lastFpsTime = Date.now();

    try {
      const reader = port.readable.getReader();
      serialReaderRef.current = reader;

      while (serialActiveRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) {
          buffer = appendBuffer(value);

          // Discard old data if buffer grows excessively without delimiters
          if (buffer.length > 2 * 1024 * 1024) {
            buffer = buffer.slice(buffer.length - 256 * 1024);
          }

          // Search for SOI: 0xFF 0xD8
          let soi = -1;
          for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
              soi = i;
              break;
            }
          }

          if (soi >= 0) {
            // Search for EOI: 0xFF 0xD9
            let eoi = -1;
            for (let i = soi + 2; i < buffer.length - 1; i++) {
              if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
                eoi = i;
                break;
              }
            }

            if (eoi > soi) {
              const frameBytes = buffer.slice(soi, eoi + 2);
              buffer = buffer.slice(eoi + 2);

              const blob = new Blob([frameBytes], { type: 'image/jpeg' });
              const url = URL.createObjectURL(blob);
              if (wiredPrevUrlRef.current) {
                URL.revokeObjectURL(wiredPrevUrlRef.current);
              }
              wiredPrevUrlRef.current = url;
              if (wiredImgRef.current) {
                wiredImgRef.current.src = url;
              }
              lastWiredFrameRef.current = url;

              frameCount++;
              const now = Date.now();
              if (now - lastFpsTime >= 1000) {
                setWiredFps(frameCount);
                frameCount = 0;
                lastFpsTime = now;
              }
            }
          }
        }
      }
    } catch (err) {
      if (serialActiveRef.current) {
        console.warn('Wired serial reader interrupted:', err.message);
      }
    } finally {
      setWiredConnected(false);
      setWiredFps(0);
    }
  };

  const startWirelessArduino = () => {
    if (streamRetryRef.current) {
      clearTimeout(streamRetryRef.current);
      streamRetryRef.current = null;
    }

    setCameraError('');
    setStreamKey((k) => k + 1);
    setCameraOn(true);

    // Non-blocking health probe: checks camera in background without delaying video display
    probeCamera().then((err) => {
      if (err) setCameraError(err);
    });
  };

  const startCamera = async () => {
    if (cameraSource === 'webcam') {
      await startWebcam();
    } else if (cameraSource === 'wired') {
      await startWiredArduino();
    } else {
      startWirelessArduino();
    }
  };

  // the <img> died mid-stream - show a brief message then auto-reconnect
  const handleStreamError = () => {
    setCameraError('Camera stream interrupted. Reconnecting in 3 seconds...');

    if (streamRetryRef.current) clearTimeout(streamRetryRef.current);
    streamRetryRef.current = setTimeout(() => {
      streamRetryRef.current = null;
      setStreamKey((k) => k + 1);
      setCameraError('');
    }, 3000);
  };

  // Clean up all resources when camera is stopped
  const stopCamera = async () => {
    if (streamRetryRef.current) {
      clearTimeout(streamRetryRef.current);
      streamRetryRef.current = null;
    }

    // Stop webcam
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop wired serial
    serialActiveRef.current = false;
    if (serialReaderRef.current) {
      try {
        await serialReaderRef.current.cancel();
      } catch {}
      serialReaderRef.current = null;
    }
    if (serialPortRef.current) {
      try {
        await serialPortRef.current.close();
      } catch {}
      serialPortRef.current = null;
    }
    if (wiredPrevUrlRef.current) {
      URL.revokeObjectURL(wiredPrevUrlRef.current);
      wiredPrevUrlRef.current = null;
    }
    lastWiredFrameRef.current = null;
    setWiredConnected(false);
    setWiredFps(0);

    setCameraOn(false);
    setCameraError('');
  };

  /* =======================================================
      AI STATUS
      ======================================================= */

  const aiOffline =
    ai && ai.ai === 'offline';

  const aiReady =
    !!ai && !aiOffline;

  /* =======================================================
     AUTOMATIC FACE DETECTION
     ======================================================= */

  useEffect(() => {
    if (
      !cameraOn ||
      mode !== 'scan' ||
      !aiReady
    ) {
      setAuto('off');

      return undefined;
    }

    let stopped = false;

    armedRef.current = true;
    absentRef.current = 0;
    errorRef.current = 0;

    setAuto('looking');

    const tick = async () => {
      if (
        stopped ||
        busyRef.current
      ) {
        return;
      }

      if (!busId) {
        setAuto('looking');

        if (!hintRef.current) {
          hintRef.current = true;

          message.warning(
            'Select a bus'
          );
        }

        return;
      }

      busyRef.current = true;

      try {
        const frame =
          await capture(
            DETECT_FRAME_W
          );

        if (!frame) {
          return;
        }

        const res =
          await api.post(
            '/face/detect',
            {
              image: frame,
              busId,
            }
          );

        const present =
          Number(
            res.data?.face_count
          ) > 0;

        if (!present) {
          absentRef.current += 1;

          if (
            absentRef.current >=
            DISAPPEARANCE_TICKS
          ) {
            setResult(null);

            // Report frame is empty to backend presence tracker
            api.post('/face/presence', { busId, faceCount: 0 }).catch(() => {});

            // Student departed from frame
            if (activeStudentLockRef.current) {
              const elapsed = Date.now() - activeStudentLockRef.current.recordedAt;
              if (elapsed >= SCAN_COOLDOWN_MS) {
                activeStudentLockRef.current = null;
              }
            }

            armedRef.current = true;
            setAuto('looking');
          } else {
            setAuto('waiting');
          }

          return;
        }

        // Face is present in frame
        absentRef.current = 0;

        // Continuous presence: if student was already verified and is still standing in frame, ignore repeated scans
        if (activeStudentLockRef.current) {
          activeStudentLockRef.current.lastSeenAt = Date.now();
          setAuto('waiting');
          return;
        }

        if (
          !armedRef.current ||
          Date.now() <
            cooldownRef.current
        ) {
          setAuto('waiting');

          return;
        }

        armedRef.current = false;

        cooldownRef.current =
          Date.now() + 2500;

        setAuto('scanning');

        const frames =
          await captureFrames(
            SCAN_FRAMES
          );

        await runScan(frames);

        errorRef.current = 0;
      } catch (e) {
        errorRef.current += 1;

        if (
          errorRef.current >= 3
        ) {
          stopped = true;

          setAuto('off');

          setAi({
            ai: 'offline',
            message:
              e.response?.data?.message ||
              e.message,
          });
        }
      } finally {
        busyRef.current = false;
      }
    };

    const id = setInterval(
      tick,
      DETECT_MS
    );

    tick();

    return () => {
      stopped = true;

      clearInterval(id);
    };
  }, [
    cameraOn,
    mode,
    busId,
    aiReady,
  ]);

  /* =======================================================
     RESULT PANEL
     ======================================================= */

  const resultPanel = () => {
    if (busy) {
      return (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 0',
          }}
        >
          <Spin tip="Matching face..." />
        </div>
      );
    }

    if (!result) {
      return (
        <Empty
          image={
            Empty.PRESENTED_IMAGE_SIMPLE
          }
          description={
            'No scan yet - face the camera'
          }
        />
      );
    }

    if (result.status === 'error') {
      return (
        <Alert
          type="error"
          showIcon
          message="Scan failed"
          description={
            result.message
          }
        />
      );
    }

    const tone =
      result.status ===
      'paid_ignored' || (result.status === 'already_recorded' && result.feeStatus === 'paid')
        ? 'success'
        : result.status ===
          'unpaid_recorded' || (result.status === 'already_recorded' && result.feeStatus !== 'paid')
          ? 'error'
          : result.status ===
            'already_recorded'
            ? 'info'
            : result.status ===
              'registered'
              ? 'info'
              : 'warning';

    const title = {
      paid_ignored:
        'Fee Paid - Boarding Allowed',

      already_recorded:
        result.feeStatus === 'paid' ? 'Fee Paid — Passenger Verified' : 'Unpaid Boarding Already Recorded',

      unpaid_recorded:
        'Unpaid Travel Recorded',

      registered:
        'Face Registered',

      low_confidence:
        'Person Not Found',

      unidentified:
        'Person Not Found',
    }[result.status] ||
      'Scan Result';

    return (
      <Alert
        type={tone}
        showIcon
        icon={
          <OutcomeIcon
            status={result.status}
          />
        }
        message={title}
        description={
          <Space
            direction="vertical"
            size={8}
            style={{
              width: '100%',
            }}
          >
            {result.student && (
              <Space size={12}>
                <Avatar
                  src={
                    result.student.photoUrl
                  }
                  size={56}
                  icon={
                    <UserOutlined />
                  }
                />

                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {
                      result.student
                        .firstName
                    }{' '}
                    {
                      result.student
                        .lastName
                    }
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.8,
                    }}
                  >
                    {
                      result.student
                        .studentId
                    }
                  </div>

                  <Tag
                    color={
                      result.student
                        .paymentStatus ===
                      'paid'
                        ? 'green'
                        : 'red'
                    }
                  >
                    {(
                      result.student
                        .paymentStatus ||
                      'unpaid'
                    ).toUpperCase()}
                  </Tag>
                </div>
              </Space>
            )}

            <div>
              {result.message}
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.75,
              }}
            >
              Confidence{' '}
              {CONF(
                result.confidence
              )}
            </div>
          </Space>
        }
      />
    );
  };

  /* =======================================================
     UI
     ======================================================= */

  return (
    <div>
      {/* HEADER */}

      <div className="page-header">
        <div>
          <h1>Face Scan</h1>

          <div className="page-subtitle">
            ESP32 CAM boarding check
          </div>
        </div>

        <Space>
          <Tooltip title="Check AI service">
            <Button
              icon={
                <ReloadOutlined />
              }
              onClick={checkAi}
            >
              AI Status
            </Button>
          </Tooltip>

          {cameraOn ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={stopCamera}
            >
              Stop Camera
            </Button>
          ) : (
            <Button
              type="primary"
              icon={
                cameraSource === 'webcam' ? (
                  <VideoCameraOutlined />
                ) : cameraSource === 'wired' ? (
                  <UsbOutlined />
                ) : (
                  <WifiOutlined />
                )
              }
              onClick={startCamera}
            >
              {cameraSource === 'webcam'
                ? 'Start Web Cam'
                : cameraSource === 'wired'
                ? 'Connect Wired Arduino'
                : 'Start Wireless Camera'}
            </Button>
          )}
        </Space>
      </div>

      {/* AI STATUS */}

      {aiOffline && (
        <Alert
          type="error"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message="Face AI service is offline"
          description={
            ai.message
          }
        />
      )}

      {!aiOffline && ai && (
        <Alert
          type="success"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message={`AI online · model ${ai.model}`}
        />
      )}

      {cameraError && (
        <Alert
          type="warning"
          showIcon
          style={{
            marginBottom: 16,
          }}
          message={cameraError}
          action={
            cameraOn ? (
              <Button
                size="small"
                onClick={startCamera}
              >
                Retry stream
              </Button>
            ) : null
          }
        />
      )}

      {/* MAIN */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 16,
        }}
      >
        {/* CAMERA */}

        <Card
          title={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                {
                  label: (
                    <span>
                      <ScanOutlined />{' '}
                      Boarding Scan
                    </span>
                  ),
                  value: 'scan',
                },
                {
                  label: (
                    <span>
                      <UserAddOutlined />{' '}
                      Register Face
                    </span>
                  ),
                  value: 'register',
                },
              ]}
            />
          }
          extra={
            <Space>
              {cameraOn && cameraSource === 'wired' && (
                <Tag color="cyan">{wiredFps} FPS</Tag>
              )}
              {cameraOn && cameraSource === 'webcam' && (
                <Tag color="blue">30 FPS</Tag>
              )}
              <Tag
                color={
                  cameraOn
                    ? 'green'
                    : 'default'
                }
              >
                {cameraOn
                  ? cameraSource === 'webcam'
                    ? 'WEBCAM LIVE'
                    : cameraSource === 'wired'
                    ? 'WIRED LIVE'
                    : 'WIRELESS LIVE'
                  : 'OFFLINE'}
              </Tag>
            </Space>
          }
        >
          {/* =================================================
              CAMERA SOURCE SELECTOR (3 BUTTONS)
              ================================================= */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Select Camera Type:
            </div>
            <Segmented
              size="middle"
              block
              value={cameraSource}
              onChange={handleCameraSourceChange}
              options={[
                {
                  label: (
                    <Space size={6}>
                      <VideoCameraOutlined style={{ color: cameraSource === 'webcam' ? '#6366f1' : undefined }} />
                      <span style={{ fontWeight: 600 }}>1) Connect Web Cam</span>
                    </Space>
                  ),
                  value: 'webcam',
                },
                {
                  label: (
                    <Space size={6}>
                      <UsbOutlined style={{ color: cameraSource === 'wired' ? '#0ea5e9' : undefined }} />
                      <span style={{ fontWeight: 600 }}>2) Connect Wired Arduino</span>
                    </Space>
                  ),
                  value: 'wired',
                },
                {
                  label: (
                    <Space size={6}>
                      <WifiOutlined style={{ color: cameraSource === 'wireless' ? '#10b981' : undefined }} />
                      <span style={{ fontWeight: 600 }}>3) Connect Wireless Arduino</span>
                    </Space>
                  ),
                  value: 'wireless',
                },
              ]}
            />
          </div>

          {/* MODE-SPECIFIC HELPER / CONFIG PANEL */}
          {cameraSource === 'webcam' && (
            <Alert
              type="info"
              showIcon
              icon={<VideoCameraOutlined />}
              style={{ marginBottom: 12, borderRadius: 8, padding: '8px 12px' }}
              message="Direct Web Cam Mode"
              description="Uses your laptop's built-in webcam or any standard USB camera plugged directly into this computer. 30 FPS HD, zero network setup."
            />
          )}

          {cameraSource === 'wired' && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <Row gutter={[12, 8]} align="middle">
                <Col xs={24} sm={14}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    Serial Baud Rate:
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    value={wiredBaud}
                    onChange={setWiredBaud}
                    disabled={cameraOn}
                    options={[
                      { label: '1,000,000 baud (Recommended - High Speed)', value: 1000000 },
                      { label: '500,000 baud (Standard)', value: 500000 },
                      { label: '115,200 baud (Slow / Low FPS)', value: 115200 },
                    ]}
                  />
                </Col>
                <Col xs={24} sm={10}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    USB Status:
                  </div>
                  <Tag color={wiredConnected ? 'blue' : 'default'} style={{ fontSize: 12, padding: '3px 8px' }}>
                    {wiredConnected ? `CONNECTED · ${wiredFps} FPS` : 'DISCONNECTED'}
                  </Tag>
                </Col>
                <Col span={24}>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    💡 Connect Uno via USB cable. Ensure Uno <b>RESET is tied to GND</b> to bypass ATmega328P. Supported in Chrome & Edge.
                  </div>
                </Col>
              </Row>
            </div>
          )}

          {cameraSource === 'wireless' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                ESP32-CAM Wi-Fi IP Address:
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={cameraUrl}
                  onChange={(e) => setCameraUrl(e.target.value)}
                  placeholder="http://10.67.1.56"
                  allowClear
                />
                <Button onClick={findCamera} loading={scanning} icon={<ReloadOutlined />}>
                  Find camera
                </Button>
                <Button type="primary" onClick={applyCamera} disabled={!cameraUrl}>
                  Apply
                </Button>
              </Space.Compact>
              {cameraMsg && (
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-muted)' }}>
                  {cameraMsg}
                </div>
              )}
            </div>
          )}

          {/* =================================================
              LIVE VIDEO VIEWPORT
              ================================================= */}

          <div
            style={{
              position: 'relative',
              background: '#0f1117',
              borderRadius: 12,
              overflow: 'hidden',
              aspectRatio: '4 / 3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: cameraOn
                ? '2px solid #3b82f6'
                : '2px dashed rgba(165,180,252,0.7)',
            }}
          >
            {/* 1) Live Web Cam Video Stream */}
            {cameraOn && cameraSource === 'webcam' && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            )}

            {/* 2) Live Wired Arduino Image Stream */}
            {cameraOn && cameraSource === 'wired' && (
              <img
                ref={wiredImgRef}
                alt="Wired Arduino Live Stream"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            )}

            {/* 3) Live Wireless ESP32-CAM MJPEG Stream */}
            {cameraOn && cameraSource === 'wireless' && (
              <img
                key={streamKey}
                src={`${ESP32_STREAM_URL}?t=${streamKey}`}
                alt="ESP32-CAM Live Stream"
                onError={handleStreamError}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            )}

            {/* Camera-off placeholder */}
            {!cameraOn && (
              <div
                style={{
                  color: '#94a3b8',
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                {cameraSource === 'webcam' ? (
                  <VideoCameraOutlined style={{ fontSize: 48, color: '#6366f1' }} />
                ) : cameraSource === 'wired' ? (
                  <UsbOutlined style={{ fontSize: 48, color: '#0ea5e9' }} />
                ) : (
                  <CameraTwoTone style={{ fontSize: 48 }} />
                )}

                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 500,
                  }}
                >
                  {cameraSource === 'webcam'
                    ? 'Web Cam is off · Click Start Camera'
                    : cameraSource === 'wired'
                    ? 'Wired Arduino is disconnected · Click Connect Wired Arduino'
                    : 'Wireless ESP32-CAM is off · Click Start Camera'}
                </div>
              </div>
            )}

            {/* Real-time Face Detection Guide Oval and Status Pill */}
            {cameraOn && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    inset: '8% 22%',
                    border: `2px ${
                      auto === 'scanning'
                        ? 'solid #06b6d4'
                        : result?.status === 'paid_ignored' || result?.status === 'already_recorded'
                        ? 'solid #10b981'
                        : result?.status === 'unpaid_recorded'
                        ? 'solid #ef4444'
                        : result?.status === 'low_confidence' || result?.status === 'unidentified'
                        ? 'solid #f59e0b'
                        : 'dashed rgba(165,180,252,0.8)'
                    }`,
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    boxShadow:
                      auto === 'scanning'
                        ? '0 0 20px rgba(6, 182, 212, 0.5)'
                        : result?.status === 'paid_ignored' || result?.status === 'already_recorded'
                        ? '0 0 20px rgba(16, 185, 129, 0.5)'
                        : result?.status === 'unpaid_recorded'
                        ? '0 0 20px rgba(239, 68, 68, 0.5)'
                        : 'none',
                    transition: 'all 0.3s ease',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(4px)',
                    color:
                      auto === 'scanning'
                        ? '#38bdf8'
                        : result?.status === 'paid_ignored' || result?.status === 'already_recorded'
                        ? '#34d399'
                        : result?.status === 'unpaid_recorded'
                        ? '#f87171'
                        : '#e2e8f0',
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    pointerEvents: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        auto === 'scanning'
                          ? '#38bdf8'
                          : result?.status === 'paid_ignored' || result?.status === 'already_recorded'
                          ? '#34d399'
                          : result?.status === 'unpaid_recorded'
                          ? '#f87171'
                          : '#94a3b8',
                      display: 'inline-block',
                    }}
                  />
                  {auto === 'scanning'
                    ? 'Scanning face...'
                    : auto === 'waiting'
                    ? 'Person seen'
                    : result?.student
                    ? `${result.student.firstName} ${result.student.lastName}`
                    : 'Looking for a face...'}
                </div>
              </>
            )}
          </div>

          {/* BUS / STUDENT SELECT */}

          <Space
            direction="vertical"
            size={12}
            style={{
              width: '100%',
              marginTop: 14,
            }}
          >

            {mode === 'scan' ? (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Bus
                </div>

                <Select
                  style={{
                    width: '100%',
                  }}
                  placeholder="Select bus"
                  value={busId}
                  onChange={
                    setBusId
                  }
                  options={buses.map(
                    (b) => ({
                      value: b._id,
                      label:
                        `${b.busNumber}${
                          b.routeName
                            ? ` (${b.routeName})`
                            : ''
                        }`,
                    })
                  )}
                />
              </div>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  Student
                </div>

                <Select
                  showSearch
                  style={{
                    width: '100%',
                  }}
                  placeholder="Select student"
                  value={
                    registerStudentId
                  }
                  onChange={
                    setRegisterStudentId
                  }
                  optionFilterProp="label"
                  options={students.map(
                    (s) => ({
                      value: s._id,
                      label:
                        `${s.firstName} ${s.lastName} (${s.studentId})`,
                    })
                  )}
                />
              </div>
            )}

            {/* AUTO STATUS */}

            {mode === 'scan' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  gap: 10,
                  minHeight: 44,
                  padding:
                    '10px 12px',
                  borderRadius: 10,
                  textAlign: 'center',
                  background:
                    auto ===
                    'scanning'
                      ? 'rgba(99,102,241,0.10)'
                      : 'rgba(16,185,129,0.10)',
                }}
              >
                {auto ===
                'scanning' ? (
                  <Spin
                    size="small"
                  />
                ) : (
                  <CameraOutlined
                    style={{
                      color:
                        '#10b981',
                    }}
                  />
                )}

                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {
                    AUTO_LABEL[
                      auto
                    ]
                  }
                </span>
              </div>
            ) : (
              <Button
                type="primary"
                size="large"
                block
                loading={busy}
                disabled={
                  !cameraOn ||
                  !registerStudentId
                }
                icon={
                  <UserAddOutlined />
                }
                onClick={
                  handleRegister
                }
              >
                Register This Face
              </Button>
            )}

            <div
              style={{
                fontSize: 12,
                color:
                  'var(--color-text-secondary)',
                textAlign: 'center',
              }}
            >
              {mode === 'scan'
                ? 'Automatic face scanning is enabled'
                : 'Captures multiple frames for registration'}
            </div>
          </Space>
        </Card>

        {/* RESULT */}

        <Space
          direction="vertical"
          size={16}
          style={{
            width: '100%',
          }}
        >
          <Card
            title={
              <span>
                <RobotOutlined /> Result
              </span>
            }
          >
            {resultPanel()}
          </Card>

          {/* HISTORY */}

          <Card
            title="Recent scans"
            size="small"
          >
            {history.length === 0 ? (
              <Empty
                image={
                  Empty.PRESENTED_IMAGE_SIMPLE
                }
                description="Nothing scanned yet"
              />
            ) : (
              <List
                size="small"
                dataSource={history}
                renderItem={
                  (item) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <OutcomeIcon
                            status={
                              item.status
                            }
                          />
                        }
                        title={
                          <Space
                            size={8}
                            wrap
                          >
                            <span>
                              {
                                item.name
                              }
                            </span>

                            <Tag>
                              {item.time.toLocaleTimeString()}
                            </Tag>

                            <Tag>
                              {String(
                                item.status
                              ).replace(
                                /_/g,
                                ' '
                              )}
                            </Tag>
                          </Space>
                        }
                        description={
                          item.detail
                        }
                      />
                    </List.Item>
                  )
                }
              />
            )}
          </Card>
        </Space>
      </div>
    </div>
  );
};

export default FaceScan;