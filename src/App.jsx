import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Utility helpers ------------------------------------------------------
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const ms = () => new Date().getTime();
const fmtTime = (msVal) => {
  const s = Math.floor(msVal / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const calcWPM = (correctChars, elapsedMs) => {
  if (!elapsedMs) return 0;
  return Math.round(((correctChars / 5) / (elapsedMs / 60000)) * 10) / 10;
};
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 10);
const cleanText = (t, options = {}) => {
  if (!t) return "";
  
  let text = t;
  
  // Basic cleanup
  text = text
    // Normalize line breaks and whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive line breaks
    .replace(/[ \t]+/g, ' ')     // Multiple spaces/tabs to single space
    .replace(/ +\n/g, '\n')      // Remove trailing spaces before line breaks
    .replace(/\n +/g, '\n')      // Remove leading spaces after line breaks
    
    // Normalize punctuation
    .replace(/[""]/g, '"')       // Smart quotes to straight quotes
    .replace(/['']/g, "'")       // Smart apostrophes to straight
    .replace(/…/g, '...')        // Ellipsis to three dots
    .replace(/—/g, '--')         // Em dash to double dash
    .replace(/–/g, '-')          // En dash to hyphen
    
    // Clean up common copy-paste artifacts
    .replace(/\u00A0/g, ' ')     // Non-breaking space to regular space
    .replace(/\u2060/g, '')      // Word joiner (invisible)
    .replace(/\uFEFF/g, '')      // Zero width no-break space (BOM)
    
    // Trim and normalize final spacing
    .trim()
    .replace(/\s+/g, ' ');       // Final cleanup: any remaining multiple spaces
  
  // Optional: Remove difficult characters for beginners
  if (options.beginner) {
    text = text
      .replace(/[-–—]/g, ' ')              // Remove all hyphens and dashes, replace with space
      .replace(/@/g, ' at ')               // Replace @ with " at "
      .replace(/[^\w\s.,!?;:'"()]/g, '')   // Keep only basic punctuation
      .replace(/[{}[\]<>#$%^&*+=|\\\/~`]/g, '') // Remove special symbols
      .replace(/\s+/g, ' ')                // Clean up multiple spaces from replacements
      .trim();
  }
  
  // Optional: Length limiting with smart truncation
  if (options.maxLength && text.length > options.maxLength) {
    // Find the last complete sentence before the limit
    const truncated = text.slice(0, options.maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    
    const lastPunctuation = Math.max(lastSentence, lastQuestion, lastExclamation);
    
    if (lastPunctuation > options.maxLength * 0.8) {
      // If we found a sentence ending in the last 20%, use it
      text = text.slice(0, lastPunctuation + 1).trim();
    } else {
      // Otherwise, find the last complete word
      const lastSpace = truncated.lastIndexOf(' ');
      text = text.slice(0, lastSpace > 0 ? lastSpace : options.maxLength).trim();
    }
  }
  
  return text;
};
const lerp = (a, b, t) => a + (b - a) * t;

// --- Built-in learning passages --------------------------------------------
const BUILT_IN = [
  {
    id: "euclid",
    title: "Euclid & Prime Numbers",
    text: "Euclid showed that there are infinitely many prime numbers. Assume a finite list of primes and multiply them together, then add one. The new number is not divisible by any prime on the list, which is a contradiction.",
  },
  {
    id: "photosynthesis",
    title: "Photosynthesis in One Breath",
    text: "Plants use sunlight to turn water and carbon dioxide into glucose and oxygen. Chlorophyll captures light energy, powering reactions that store energy in chemical bonds.",
  },
  {
    id: "vaccines",
    title: "How Vaccines Train Immunity",
    text: "Vaccines expose the immune system to a safe version of a pathogen. This rehearsal teaches memory cells to respond quickly later, reducing the risk of severe disease.",
  },
  {
    id: "internet",
    title: "The Internet in a Nutshell",
    text: "The internet is a global network of networks that speak common protocols. Data is chopped into packets, routed independently, and reassembled at its destination.",
  },
  {
    id: "blackholes",
    title: "What Is a Black Hole?",
    text: "A black hole is a region of spacetime where gravity is so strong that nothing, not even light, can escape. Around it lies the event horizon, a one-way boundary.",
  },
];

// Names + colors for AI opponents
const BOT_NAMES = [
  "Ada", "Turing", "Hedy", "Linus", "Grace", "Kernighan", "Lovelace", "Guido",
  "Marquez", "Curie", "Tesla", "Noether", "Hopper", "Babbage", "Knuth",
];
const hue = () => Math.floor(Math.random() * 360);

// Local storage helpers
const LS = {
  LIB: "typeracer_poc_library_v1",
  STATS: "typeracer_poc_stats_v1",
};
const loadLib = () => {
  try { return JSON.parse(localStorage.getItem(LS.LIB) || "[]"); } catch { return []; }
};
const saveLib = (lib) => localStorage.setItem(LS.LIB, JSON.stringify(lib || []));
const loadStats = () => {
  try { return JSON.parse(localStorage.getItem(LS.STATS) || "{\"history\":[]}" ); } catch { return { history: [] }; }
};
const saveStats = (stats) => localStorage.setItem(LS.STATS, JSON.stringify(stats || { history: [] }));

// --- Custom Text Modal Component ------------------------------------------
function CustomTextModal({ isOpen, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [beginnerMode, setBeginnerMode] = useState(false);
  const [maxLength, setMaxLength] = useState(800);
  const textareaRef = useRef(null);

  // Get processed text preview
  const processedText = useMemo(() => {
    return cleanText(text, { 
      beginner: beginnerMode, 
      maxLength: maxLength 
    });
  }, [text, beginnerMode, maxLength]);

  // Auto-generate title from first few words of processed text
  useEffect(() => {
    if (processedText && !title) {
      const words = processedText.trim().split(/\s+/).slice(0, 5);
      setTitle(words.join(" "));
    }
  }, [processedText, title]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSave = () => {
    if (processedText) {
      onSave(title || "Custom Passage", processedText);
      setTitle("");
      setText("");
      setBeginnerMode(false);
      setMaxLength(800);
      onClose();
    }
  };

  const handleCancel = () => {
    setTitle("");
    setText("");
    setBeginnerMode(false);
    setMaxLength(800);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-xl font-bold">✍️ Add Custom Text</h2>
          <button
            onClick={handleCancel}
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Passage title (auto-generated from text)"
              className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-0 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>

          {/* Processing Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Max Length</label>
              <select
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-0 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={400}>Short (400 chars)</option>
                <option value={800}>Medium (800 chars)</option>
                <option value={1200}>Long (1200 chars)</option>
                <option value={2000}>Extra Long (2000 chars)</option>
              </select>
            </div>
            
            <div>
              <label className="flex items-center space-x-2 mt-6">
                <input
                  type="checkbox"
                  checked={beginnerMode}
                  onChange={(e) => setBeginnerMode(e.target.checked)}
                  className="rounded border-zinc-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200"
                />
                <span className="text-sm font-medium">Beginner Mode</span>
              </label>
              <p className="text-xs text-zinc-500 mt-1">Remove difficult punctuation & symbols</p>
            </div>
          </div>

          {/* Text Area */}
          <div className="flex-1 flex flex-col">
            <label className="block text-sm font-medium mb-2">Raw Text Input</label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type your passage here..."
              className="min-h-[200px] px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-0 focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all font-mono text-sm"
            />
            {text && (
              <div className="text-xs text-zinc-500 mt-2 flex justify-between">
                <span>Original: {text.length} chars • {text.trim().split(/\s+/).length} words</span>
                <span>Processed: {processedText.length} chars • {processedText.trim().split(/\s+/).length} words</span>
              </div>
            )}
          </div>

          {/* Preview */}
          {processedText && (
            <div>
              <label className="block text-sm font-medium mb-2">Preview (Processed Text)</label>
              <div className="max-h-32 overflow-y-auto px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-mono leading-relaxed">
                {processedText}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-200 dark:border-zinc-700">
          <button
            onClick={handleCancel}
            className="px-6 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
          >
            Cancel
          </button>
          <motion.button
            onClick={handleSave}
            disabled={!processedText.trim()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save & Use
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Enhanced 2D RaceTrack Component ---------------------------------------
function RaceTrack({ racers, isRacing, state, textLength }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const cameraRef = useRef({ x: 0, targetX: 0 });
  const sparklesRef = useRef([]);
  
  const TRACK_LENGTH = 1200;
  const LANE_HEIGHT = 85;
  const CAR_WIDTH = 50;
  const CAR_HEIGHT = 28;
  
  // Enhanced car drawing with modern styling
  const drawCar = useCallback((ctx, x, y, color, isPlayer = false, racer = null) => {
    ctx.save();
    ctx.translate(x, y);
    
    // Car shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-CAR_WIDTH/2 + 2, -CAR_HEIGHT/2 + 2, CAR_WIDTH, CAR_HEIGHT);
    
    // Main car body with gradient
    const gradient = ctx.createLinearGradient(0, -CAR_HEIGHT/2, 0, CAR_HEIGHT/2);
    if (isPlayer) {
      gradient.addColorStop(0, '#3b82f6');
      gradient.addColorStop(0.5, '#1d4ed8');
      gradient.addColorStop(1, '#1e40af');
    } else {
      const h = racer?.hue || 0;
      gradient.addColorStop(0, `hsl(${h}, 70%, 65%)`);
      gradient.addColorStop(0.5, `hsl(${h}, 80%, 55%)`);
      gradient.addColorStop(1, `hsl(${h}, 85%, 45%)`);
    }
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT, 8);
    ctx.fill();
    
    // Car outline
    ctx.strokeStyle = isPlayer ? '#1e40af' : `hsl(${racer?.hue || 0}, 90%, 35%)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Windshield with realistic glass effect
    const windshieldGradient = ctx.createLinearGradient(0, -CAR_HEIGHT/2, 0, 0);
    windshieldGradient.addColorStop(0, 'rgba(135,206,250,0.9)');
    windshieldGradient.addColorStop(1, 'rgba(135,206,250,0.4)');
    ctx.fillStyle = windshieldGradient;
    ctx.beginPath();
    ctx.roundRect(-CAR_WIDTH/2 + 8, -CAR_HEIGHT/2 + 3, CAR_WIDTH - 16, 12, 4);
    ctx.fill();
    
    // Headlights
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.ellipse(CAR_WIDTH/2 - 3, -6, 3, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(CAR_WIDTH/2 - 3, 6, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Wheels with rim details
    const wheelGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
    wheelGradient.addColorStop(0, '#4b5563');
    wheelGradient.addColorStop(0.7, '#374151');
    wheelGradient.addColorStop(1, '#1f2937');
    
    ctx.fillStyle = wheelGradient;
    ctx.beginPath();
    ctx.arc(-CAR_WIDTH/3, CAR_HEIGHT/2 + 4, 6, 0, Math.PI * 2);
    ctx.arc(CAR_WIDTH/3, CAR_HEIGHT/2 + 4, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Wheel rims
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-CAR_WIDTH/3, CAR_HEIGHT/2 + 4, 4, 0, Math.PI * 2);
    ctx.arc(CAR_WIDTH/3, CAR_HEIGHT/2 + 4, 4, 0, Math.PI * 2);
    ctx.stroke();
    
    // Player crown
    if (isPlayer) {
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10, -CAR_HEIGHT/2 - 8);
      ctx.lineTo(-6, -CAR_HEIGHT/2 - 16);
      ctx.lineTo(-2, -CAR_HEIGHT/2 - 12);
      ctx.lineTo(2, -CAR_HEIGHT/2 - 16);
      ctx.lineTo(6, -CAR_HEIGHT/2 - 12);
      ctx.lineTo(10, -CAR_HEIGHT/2 - 16);
      ctx.lineTo(10, -CAR_HEIGHT/2 - 6);
      ctx.lineTo(-10, -CAR_HEIGHT/2 - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    
    // Speed effect lines for moving cars
    if (isRacing && racer?.wpm > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const offset = (Date.now() * 0.01 + i * 10) % 20 - 10;
        ctx.beginPath();
        ctx.moveTo(-CAR_WIDTH/2 - 15 + offset, -8 + i * 8);
        ctx.lineTo(-CAR_WIDTH/2 - 5 + offset, -8 + i * 8);
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }, []);
  
  const drawTrack = useCallback((ctx, canvas) => {
    const { width, height } = canvas;
    const camera = cameraRef.current;
    
    // Sky gradient background
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, '#87ceeb');
    skyGradient.addColorStop(1, '#98fb98');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);
    
    // Grass texture
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, 0, width, height);
    
    // Add grass pattern
    ctx.fillStyle = '#16a34a';
    for (let x = 0; x < width + camera.x; x += 20) {
      for (let y = 0; y < height; y += 15) {
        if (Math.random() > 0.7) {
          ctx.fillRect(x - camera.x, y, 2, 8);
        }
      }
    }
    
    // Track setup
    const trackY = height / 2 - (racers.length * LANE_HEIGHT) / 2;
    const trackHeight = racers.length * LANE_HEIGHT;
    
    // Track surface with realistic asphalt texture
    const trackGradient = ctx.createLinearGradient(0, trackY, 0, trackY + trackHeight);
    trackGradient.addColorStop(0, '#4b5563');
    trackGradient.addColorStop(0.5, '#374151');
    trackGradient.addColorStop(1, '#4b5563');
    ctx.fillStyle = trackGradient;
    ctx.fillRect(-camera.x, trackY, TRACK_LENGTH + camera.x + width, trackHeight);
    
    // Asphalt texture
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let x = -camera.x; x < TRACK_LENGTH + width; x += 8) {
      for (let y = trackY; y < trackY + trackHeight; y += 6) {
        if (Math.random() > 0.8) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    // Lane dividers with proper dashed lines
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.setLineDash([15, 10]);
    for (let i = 1; i < racers.length; i++) {
      const y = trackY + i * LANE_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(-camera.x, y);
      ctx.lineTo(TRACK_LENGTH + width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // Track borders with curb effect
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-camera.x, trackY);
    ctx.lineTo(TRACK_LENGTH + width, trackY);
    ctx.moveTo(-camera.x, trackY + trackHeight);
    ctx.lineTo(TRACK_LENGTH + width, trackY + trackHeight);
    ctx.stroke();
    
    // White border lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-camera.x, trackY - 4);
    ctx.lineTo(TRACK_LENGTH + width, trackY - 4);
    ctx.moveTo(-camera.x, trackY + trackHeight + 4);
    ctx.lineTo(TRACK_LENGTH + width, trackY + trackHeight + 4);
    ctx.stroke();
    
    // Start line with modern styling
    const startX = 80;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX - camera.x, trackY - 10, 6, trackHeight + 20);
    
    // Start line decoration
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START', startX - camera.x, trackY - 20);
    
    // Finish line with checkered flag pattern
    const finishX = TRACK_LENGTH - 80;
    const checkerSize = 8;
    for (let y = 0; y < trackHeight + 20; y += checkerSize) {
      for (let x = 0; x < 20; x += checkerSize) {
        const isBlack = (Math.floor(y / checkerSize) + Math.floor(x / checkerSize)) % 2 === 0;
        ctx.fillStyle = isBlack ? '#000000' : '#ffffff';
        ctx.fillRect(finishX - camera.x + x, trackY - 10 + y, checkerSize, checkerSize);
      }
    }
    
    // Finish line decoration
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', finishX - camera.x, trackY - 20);
    
    // Progress markers
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px sans-serif';
    for (let i = 1; i < 4; i++) {
      const markerX = (TRACK_LENGTH * i / 4) - camera.x;
      ctx.fillText(`${i * 25}%`, markerX, trackY - 25);
      ctx.fillRect(markerX - 1, trackY, 2, trackHeight);
    }
    
  }, [racers.length]);
  
  // Sparkles and celebration effects
  const updateSparkles = useCallback(() => {
    const finishedRacers = racers.filter(r => textLength > 0 && r.progress >= textLength);
    
    finishedRacers.forEach((racer, index) => {
      const laneY = (canvasRef.current?.height || 400) / 2 - (racers.length * LANE_HEIGHT) / 2 + index * LANE_HEIGHT + LANE_HEIGHT / 2;
      const x = TRACK_LENGTH - 80;
      
      // Add new sparkles
      if (Math.random() > 0.8) {
        sparklesRef.current.push({
          x: x + (Math.random() - 0.5) * 60,
          y: laneY + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 1,
          hue: racer.hue,
          size: Math.random() * 4 + 2
        });
      }
    });
    
    // Update existing sparkles
    sparklesRef.current = sparklesRef.current.filter(sparkle => {
      sparkle.x += sparkle.vx;
      sparkle.y += sparkle.vy;
      sparkle.life -= 0.02;
      return sparkle.life > 0;
    }).slice(-50); // Limit sparkles
  }, [racers, textLength]);
  
  const drawSparkles = useCallback((ctx, camera) => {
    sparklesRef.current.forEach(sparkle => {
      ctx.save();
      ctx.globalAlpha = sparkle.life;
      ctx.fillStyle = `hsl(${sparkle.hue}, 80%, 60%)`;
      ctx.beginPath();
      ctx.arc(sparkle.x - camera.x, sparkle.y, sparkle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }, []);
  
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    
    // Update camera to follow leader
    const leader = racers.reduce((prev, curr) => 
      (curr.progress > prev.progress) ? curr : prev, racers[0] || { progress: 0 });
    
    if (leader && textLength > 0) {
      const leaderProgress = leader.progress / textLength;
      const targetX = Math.max(0, Math.min(TRACK_LENGTH - width + 100, (leaderProgress * TRACK_LENGTH) - width/2));
      cameraRef.current.targetX = targetX;
      cameraRef.current.x = lerp(cameraRef.current.x, cameraRef.current.targetX, 0.08);
    }
    
    drawTrack(ctx, canvas);
    
    // Draw racers
    const trackY = height / 2 - (racers.length * LANE_HEIGHT) / 2;
    racers.forEach((racer, index) => {
      const laneY = trackY + index * LANE_HEIGHT + LANE_HEIGHT / 2;
      const progress = textLength > 0 ? racer.progress / textLength : 0;
      const x = 80 + (progress * (TRACK_LENGTH - 160));
      
      drawCar(ctx, x - cameraRef.current.x, laneY, null, racer.isPlayer, racer);
      
      // Racer nameplate with modern styling
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(x - cameraRef.current.x - 30, laneY - 50, 60, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(racer.name, x - cameraRef.current.x, laneY - 37);
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`${Math.round(racer.wpm)} WPM`, x - cameraRef.current.x, laneY - 26);
      ctx.restore();
    });
    
    // Update and draw celebration effects
    updateSparkles();
    drawSparkles(ctx, cameraRef.current);
    
    if (isRacing || state === "finished") {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [racers, isRacing, state, textLength, drawTrack, drawCar, updateSparkles, drawSparkles]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    if (isRacing || state === "finished") {
      animate();
    }
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRacing, state, animate]);
  
  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-700"
      style={{ height: Math.max(320, racers.length * 85 + 100) }}
    />
  );
}

// --- Main Component --------------------------------------------------------
export default function TypeTutorRacerPOC() {
  const [library, setLibrary] = useState(() => loadLib());
  const [selectedBuiltIn, setSelectedBuiltIn] = useState(BUILT_IN[0].id);
  const [customText, setCustomText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("Built‑in passage");

  // Race settings
  const [numBots, setNumBots] = useState(2);
  const [profile, setProfile] = useState("balanced");
  const [countdown, setCountdown] = useState(3);
  const [strict, setStrict] = useState(true);
  const [chunkLen, setChunkLen] = useState(600);
  
  // Modal state
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Derived text
  const text = useMemo(() => {
    let t = customText
      ? cleanText(customText)
      : cleanText(BUILT_IN.find((b) => b.id === selectedBuiltIn)?.text || "");
    if (!t) return "";
    return t.slice(0, chunkLen);
  }, [customText, selectedBuiltIn, chunkLen]);

  // Race state
  const [state, setState] = useState("idle");
  const [count, setCount] = useState(countdown);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentTypedWord, setCurrentTypedWord] = useState("");
  const [wordResults, setWordResults] = useState([]); // {word, typed, correct, timestamp}
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [bots, setBots] = useState([]);
  const [tick, setTick] = useState(0);

  const inputRef = useRef(null);

  // Split text into words for word-based matching
  const words = useMemo(() => {
    return text.split(/\s+/).filter(word => word.length > 0);
  }, [text]);

  // Calculate progress and stats based on word completion
  const correctWords = useMemo(() => {
    return wordResults.filter(result => result.correct).length;
  }, [wordResults]);

  const totalTypedChars = useMemo(() => {
    return wordResults.reduce((total, result) => {
      return total + result.word.length + 1; // +1 for space
    }, 0) + currentTypedWord.length;
  }, [wordResults, currentTypedWord]);

  const correctChars = useMemo(() => {
    const completedCorrectChars = wordResults
      .filter(result => result.correct)
      .reduce((total, result) => total + result.word.length + 1, 0); // +1 for space
    
    // Add partial progress for current word if it's being typed correctly
    const currentWord = words[currentWordIndex] || "";
    let currentCorrectChars = 0;
    for (let i = 0; i < Math.min(currentTypedWord.length, currentWord.length); i++) {
      if (currentTypedWord[i] === currentWord[i]) {
        currentCorrectChars++;
      } else {
        break; // Stop at first mistake
      }
    }
    
    return completedCorrectChars + currentCorrectChars;
  }, [wordResults, currentTypedWord, words, currentWordIndex]);

  const accuracy = useMemo(() => {
    if (wordResults.length === 0) return 100;
    return Math.round((correctWords / wordResults.length) * 100);
  }, [correctWords, wordResults.length]);

  const errors = useMemo(() => {
    return wordResults.filter(result => !result.correct).length;
  }, [wordResults]);

  const elapsedMs = endTime ? endTime - startTime : (startTime ? ms() - startTime : 0);
  const wpm = calcWPM(correctChars, elapsedMs);

  // Create racers array for track visualization
  const racers = useMemo(() => {
    const playerRacer = {
      id: 'player',
      name: 'You',
      hue: 200,
      wpm: wpm,
      progress: correctChars,
      isPlayer: true
    };
    
    const botRacers = bots.map(bot => ({
      ...bot,
      isPlayer: false
    }));
    
    return [playerRacer, ...botRacers];
  }, [wpm, correctChars, bots]);

  // Focus input when race starts
  useEffect(() => {
    if (state === "running" && inputRef.current) inputRef.current.focus();
  }, [state]);

  // Countdown logic
  useEffect(() => {
    if (state !== "counting") return;
    setCount(countdown);
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(id);
          setupBots();
          setStartTime(ms());
          setState("running");
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, countdown]);

  // Bot tick
  useEffect(() => {
    if (state !== "running") return;
    const t0 = ms();
    let last = t0;
    const id = setInterval(() => {
      const now = ms();
      const dt = (now - last) / 1000;
      last = now;
      setBots((prev) => prev.map((b) => {
        if (b.progress >= text.length) return b;
        const cps = (b.wpm * 5) / 60;
        const jitter = 0.85 + Math.random() * 0.3;
        const inc = cps * dt * jitter;
        return { ...b, progress: Math.min(text.length, b.progress + inc) };
      }));
      setTick((t) => t + 1);
    }, 100);
    return () => clearInterval(id);
  }, [state, text.length]);

  // Finish detection
  useEffect(() => {
    if (state !== "running") return;
    const humanDone = correctChars >= text.length;
    const anyBotDone = bots.some((b) => b.progress >= text.length);
    if (humanDone || anyBotDone) {
      setEndTime(ms());
      setState("finished");
      recordResult(humanDone);
    }
  }, [tick, correctChars, bots, state, text.length]);

  // Setup bots
  const setupBots = () => {
    const ranges = {
      chill: [35, 45],
      balanced: [55, 70],
      speedy: [85, 110],
    };
    const [min, max] = ranges[profile] || [50, 70];
    const makeBot = () => {
      const h = hue();
      return {
        id: uid(),
        name: sample(BOT_NAMES),
        hue: h,
        wpm: Math.round(min + Math.random() * (max - min)),
        progress: 0,
      };
    };
    setBots(Array.from({ length: numBots }, makeBot));
  };

  // Record results
  const recordResult = (humanFinished) => {
    const timeTaken = ms() - startTime;
    const humanWPM = calcWPM(correctChars, timeTaken);
    const placing = (() => {
      const botsAhead = bots.filter((b) => b.progress >= text.length && !humanFinished).length;
      return 1 + botsAhead;
    })();

    const stats = loadStats();
    const entry = {
      id: uid(),
      date: new Date().toISOString(),
      title: sourceTitle || (customText ? "Custom Upload" : BUILT_IN.find(b => b.id === selectedBuiltIn)?.title),
      wpm: humanWPM,
      accuracy,
      errors,
      length: text.length,
      placing,
      opponents: bots.map((b) => ({ name: b.name, wpm: b.wpm })),
    };
    const history = [entry, ...(stats.history || [])].slice(0, 25);
    saveStats({ history });
  };

  // Controls
  const startRace = () => {
    setCurrentWordIndex(0);
    setCurrentTypedWord("");
    setWordResults([]);
    setStartTime(null);
    setEndTime(null);
    setState("counting");
    setCount(countdown);
  };
  
  const resetRace = () => {
    setCurrentWordIndex(0);
    setCurrentTypedWord("");
    setWordResults([]);
    setStartTime(null);
    setEndTime(null);
    setBots([]);
    setState("idle");
  };

  // Input handler with word-based matching
  const onType = (e) => {
    const value = e.target.value;
    
    // Start timer on first keystroke
    if (!startTime && state === "running") setStartTime(ms());
    
    // Check if user pressed space (word completion)
    if (value.endsWith(' ') || value.endsWith('\t')) {
      const typedWord = value.slice(0, -1).trim(); // Remove space/tab and trim
      const targetWord = words[currentWordIndex];
      
      if (targetWord) {
        // Record the word result
        const isCorrect = typedWord === targetWord;
        const result = {
          word: targetWord,
          typed: typedWord,
          correct: isCorrect,
          timestamp: ms()
        };
        
        setWordResults(prev => [...prev, result]);
        setCurrentWordIndex(prev => prev + 1);
        setCurrentTypedWord("");
        
        // Clear input for next word
        e.target.value = "";
        
        // Check if race is complete
        if (currentWordIndex + 1 >= words.length) {
          setEndTime(ms());
          setState("finished");
          recordResult(true);
        }
      }
    } else {
      // Update current word being typed
      setCurrentTypedWord(value);
      
      // In strict mode, prevent typing if current character is wrong
      if (strict) {
        const currentWord = words[currentWordIndex] || "";
        if (value.length > 0) {
          const lastChar = value[value.length - 1];
          const expectedChar = currentWord[value.length - 1];
          
          if (lastChar !== expectedChar) {
            // Don't allow the wrong character
            e.target.value = value.slice(0, -1);
            setCurrentTypedWord(value.slice(0, -1));
            return;
          }
        }
      }
    }
  };

  // Upload handlers
  const onUpload = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const t = cleanText(String(reader.result || ""));
      setCustomText(t);
      setSourceTitle(file.name);
    };
    reader.readAsText(file);
  };

  const saveCurrentToLibrary = () => {
    const title = prompt("Save this passage as:", sourceTitle || "Custom passage");
    if (!title) return;
    const lib = loadLib();
    const entry = { id: uid(), title, text };
    const updated = [entry, ...lib].slice(0, 50);
    saveLib(updated);
    setLibrary(updated);
    alert("Saved to your library.");
  };

  const loadFromLibrary = (id) => {
    const item = library.find((x) => x.id === id);
    if (!item) return;
    setCustomText(item.text);
    setSourceTitle(item.title);
  };

  const removeFromLibrary = (id) => {
    const updated = (library || []).filter((x) => x.id !== id);
    saveLib(updated);
    setLibrary(updated);
  };

  // Handle custom text from modal
  const handleCustomTextSave = (title, text) => {
    setCustomText(text);
    setSourceTitle(title);
    
    // Also save to library for future use
    const lib = loadLib();
    const entry = { id: uid(), title, text };
    const updated = [entry, ...lib].slice(0, 50);
    saveLib(updated);
    setLibrary(updated);
  };

  // Render text with highlighting
  const renderText = () => {
    if (!text) return (
      <div className="rounded-2xl p-6 bg-white/90 dark:bg-zinc-900/90 shadow-inner leading-loose text-lg text-zinc-800 dark:text-zinc-100 font-mono">
        <span className="opacity-50">Select or upload a passage to begin racing...</span>
      </div>
    );

    return (
      <div className="rounded-2xl p-6 bg-white/90 dark:bg-zinc-900/90 shadow-inner leading-loose text-lg text-zinc-800 dark:text-zinc-100 font-mono break-words overflow-wrap-anywhere">
        {words.map((word, wordIndex) => {
          const isCompleted = wordIndex < currentWordIndex;
          const isCurrent = wordIndex === currentWordIndex;
          const wordResult = wordResults[wordIndex];
          
          let wordClass = "transition-all duration-150 mr-2";
          
          if (isCompleted) {
            wordClass += wordResult?.correct 
              ? " text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1 rounded" 
              : " text-red-600 bg-red-100 dark:bg-red-900/30 px-1 rounded";
          } else if (isCurrent) {
            wordClass += " bg-blue-200 dark:bg-blue-500/40 px-1 rounded";
            
            // Show character-by-character progress for current word
            return (
              <span key={wordIndex} className={wordClass}>
                {word.split("").map((char, charIndex) => {
                  const isTyped = charIndex < currentTypedWord.length;
                  const isCorrect = isTyped && currentTypedWord[charIndex] === char;
                  const isWrong = isTyped && currentTypedWord[charIndex] !== char;
                  
                  let charClass = "";
                  if (isCorrect) charClass = "text-emerald-600";
                  else if (isWrong) charClass = "text-red-600 bg-red-200 dark:bg-red-800";
                  else if (charIndex === currentTypedWord.length) charClass = "animate-pulse bg-blue-300 dark:bg-blue-600";
                  
                  return <span key={charIndex} className={charClass}>{char}</span>;
                })}
              </span>
            );
          } else {
            wordClass += " opacity-60";
          }
          
          return <span key={wordIndex} className={wordClass}>{word}</span>;
        })}
      </div>
    );
  };

  const stats = loadStats();

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-slate-900 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            TypeTutor Racer
          </h1>
          <p className="text-lg opacity-75">Learn while you type • Race against AI • Improve your speed</p>
        </header>

        {/* Race Setup Controls - Above the Canvas */}
        <div className="rounded-3xl p-6 bg-white/80 dark:bg-zinc-900/70 shadow-xl mb-6">
          <div className="flex flex-wrap items-center gap-6 justify-between">
            
            {/* Left Side - Race Controls */}
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">AI Racers:</label>
                <span className="text-lg font-bold text-blue-600 min-w-[2ch]">{numBots}</span>
                <input 
                  type="range" 
                  min={0} 
                  max={5} 
                  value={numBots} 
                  onChange={(e) => setNumBots(Number(e.target.value))}
                  className="w-20 accent-blue-600"
                />
              </div>
              
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Difficulty:</label>
                <select 
                  className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-0 font-medium text-sm" 
                  value={profile} 
                  onChange={(e) => setProfile(e.target.value)}
                >
                  <option value="chill">🐌 Chill</option>
                  <option value="balanced">⚖️ Balanced</option>
                  <option value="speedy">🚀 Speedy</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Strict:</label>
                <input 
                  type="checkbox" 
                  checked={strict} 
                  onChange={(e) => setStrict(e.target.checked)}
                  className="scale-125 accent-blue-600"
                />
              </div>
            </div>

            {/* Center - Race Status */}
            <div className="text-center">
              <div className="text-sm font-medium px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50">
                {state === "counting" && `Starting in ${count}...`}
                {state === "running" && "🏃‍♂️ Racing!"}
                {state === "finished" && "🏆 Finished!"}
                {state === "idle" && "⏳ Ready to race"}
              </div>
            </div>

            {/* Right Side - Action Buttons */}
            <div className="flex gap-3">
              <motion.button 
                onClick={startRace}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold shadow-lg hover:shadow-xl transition-all"
              >
                {state === "running" ? "🔄 Restart" : "🏁 Start Race"}
              </motion.button>
              
              <button 
                onClick={resetRace}
                className="px-4 py-3 rounded-2xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Main Race Interface */}
        <div className="space-y-6">
          
          {/* Full Width Race Canvas */}
          <div className="w-full space-y-6">
            
            {/* Race Track */}
            <div className="rounded-3xl p-6 bg-white/80 dark:bg-zinc-900/70 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-xl">🏁 Race Track</h2>
                <div className="text-sm font-medium px-3 py-1 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50">
                  {state === "counting" && `Starting in ${count}...`}
                  {state === "running" && "🏃‍♂️ Racing!"}
                  {state === "finished" && "🏆 Finished!"}
                  {state === "idle" && "⏳ Ready to race"}
                </div>
              </div>
              
              <RaceTrack 
                racers={racers} 
                isRacing={state === "running"} 
                state={state}
                textLength={text.length}
              />
            </div>

            {/* Text and Input */}
            <div className="rounded-3xl p-6 bg-white/80 dark:bg-zinc-900/70 shadow-xl">
              <div className="mb-4 max-w-full overflow-hidden">
                <h3 className="font-bold text-lg mb-2">Type the passage below:</h3>
                {renderText()}
              </div>
              
              <input
                ref={inputRef}
                disabled={state !== "running"}
                value={currentTypedWord}
                onChange={onType}
                placeholder={state === "running" ? "Start typing here..." : "Click 'Start Race' to begin!"}
                className="w-full px-6 py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-2 border-transparent focus:border-blue-500 outline-none text-lg font-mono disabled:opacity-50 transition-all"
              />
              
              <p className="text-sm opacity-60 mt-2">
                💡 Tip: {strict ? "Fix mistakes before continuing" : "Speed matters more than perfection"}
              </p>
            </div>

            {/* Passage Management */}
            <div className="rounded-3xl p-6 bg-white/70 dark:bg-zinc-900/60 shadow-xl">
              <h3 className="font-bold text-lg mb-4">📚 Passage Library</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Select Passage:</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800"
                    value={customText ? `custom-${sourceTitle}` : selectedBuiltIn}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.startsWith('custom-')) {
                        // Find and load custom passage
                        const customTitle = value.replace('custom-', '');
                        const item = library.find(x => x.title === customTitle);
                        if (item) {
                          setCustomText(item.text);
                          setSourceTitle(item.title);
                          setSelectedBuiltIn("");
                        }
                      } else {
                        // Load built-in passage
                        setSelectedBuiltIn(value);
                        setCustomText("");
                        setSourceTitle("Built-in passage");
                      }
                    }}
                  >
                    <optgroup label="Built-in Passages">
                      {BUILT_IN.map((b) => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </optgroup>
                    {library.length > 0 && (
                      <optgroup label="Your Custom Passages">
                        {library.map((item) => (
                          <option key={item.id} value={`custom-${item.title}`}>
                            {item.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium block">Upload File:</label>
                  <input
                    type="file"
                    accept=".txt,.md"
                    className="w-full text-sm"
                    onChange={(e) => onUpload(e.target.files?.[0])}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                  onClick={() => setShowCustomModal(true)}
                >
                  ✍️ Add Custom Text
                </button>
                
                <button 
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors" 
                  onClick={saveCurrentToLibrary}
                >
                  💾 Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Results */}
        <div className="rounded-3xl p-6 bg-white/70 dark:bg-zinc-900/60 shadow-xl">
          <h2 className="font-bold text-xl mb-4">🏆 Recent Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(stats.history || []).slice(0, 6).map((h) => (
              <div key={h.id} className="p-4 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700">
                <div className="font-bold text-sm mb-1">{h.title}</div>
                <div className="text-xs opacity-70 mb-2">{new Date(h.date).toLocaleDateString()}</div>
                <div className="flex justify-between text-sm">
                  <span>🚀 {h.wpm} WPM</span>
                  <span>🎯 {h.accuracy}%</span>
                  <span>🏁 #{h.placing}</span>
                </div>
              </div>
            ))}
            {(stats.history || []).length === 0 && (
              <div className="col-span-full text-center opacity-60 py-8">
                No races completed yet. Start your first race! 🏁
              </div>
            )}
          </div>
        </div>

        {/* Custom Text Modal */}
        <AnimatePresence>
          {showCustomModal && (
            <CustomTextModal
              isOpen={showCustomModal}
              onClose={() => setShowCustomModal(false)}
              onSave={handleCustomTextSave}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
