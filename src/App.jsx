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
  
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/…/g, '...')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2060/g, '')
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  
  if (options.beginner) {
    text = text
      .replace(/[-—–]/g, ' ')
      .replace(/@/g, ' at ')
      .replace(/[^\w\s.,!?;:'"()]/g, '')
      .replace(/[{}[\]<>#$%^&*+=|\\\/~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  if (options.maxLength && text.length > options.maxLength) {
    const truncated = text.slice(0, options.maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    
    const lastPunctuation = Math.max(lastSentence, lastQuestion, lastExclamation);
    
    if (lastPunctuation > options.maxLength * 0.8) {
      text = text.slice(0, lastPunctuation + 1).trim();
    } else {
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

// Professional AI opponent names
const BOT_NAMES = [
  "Ada", "Turing", "Hedy", "Linus", "Grace", "Kernighan", "Lovelace", "Guido",
  "Marquez", "Curie", "Tesla", "Noether", "Hopper", "Babbage", "Knuth",
];

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

// --- Minimal Custom Text Modal Component ----------------------------------
function CustomTextModal({ isOpen, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [beginnerMode, setBeginnerMode] = useState(false);
  const [maxLength, setMaxLength] = useState(800);
  const textareaRef = useRef(null);

  const processedText = useMemo(() => {
    return cleanText(text, { 
      beginner: beginnerMode, 
      maxLength: maxLength 
    });
  }, [text, beginnerMode, maxLength]);

  useEffect(() => {
    if (processedText && !title) {
      const words = processedText.trim().split(/\s+/).slice(0, 5);
      setTitle(words.join(" "));
    }
  }, [processedText, title]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

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
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-12 py-8 bg-gray-50">
          <h2 className="text-2xl font-bold text-gray-700">Add Custom Text</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none transition-colors duration-200"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-12 py-8 space-y-8 overflow-y-auto">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a descriptive title for your passage"
              className="w-full px-0 py-3 bg-transparent border-0 border-b border-gray-300 focus:border-gray-600 outline-none text-lg transition-colors duration-200"
            />
          </div>

          {/* Processing Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Maximum Length
              </label>
              <select
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                className="w-full px-0 py-3 bg-transparent border-0 border-b border-gray-300 focus:border-gray-600 outline-none text-lg transition-colors duration-200"
              >
                <option value={400}>Short (400 characters)</option>
                <option value={800}>Medium (800 characters)</option>
                <option value={1200}>Long (1200 characters)</option>
                <option value={2000}>Extended (2000 characters)</option>
              </select>
            </div>
            
            <div className="flex flex-col justify-center">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={beginnerMode}
                  onChange={(e) => setBeginnerMode(e.target.checked)}
                  className="w-5 h-5 text-gray-600"
                />
                <span className="text-sm font-semibold text-gray-700">
                  Beginner Mode
                </span>
              </label>
              <p className="text-sm text-gray-500 mt-2 ml-8">
                Simplifies punctuation and removes special characters
              </p>
            </div>
          </div>

          {/* Text Area */}
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-gray-700">
              Text Content
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type your passage content here..."
              className="w-full h-48 px-0 py-4 bg-transparent border-0 border-b border-gray-300 focus:border-gray-600 outline-none resize-none font-mono text-base leading-relaxed transition-colors duration-200"
            />
            {text && (
              <div className="text-sm text-gray-500 flex justify-between pt-4">
                <span>Original: {text.length} chars • {text.trim().split(/\s+/).length} words</span>
                <span>Processed: {processedText.length} chars • {processedText.trim().split(/\s+/).length} words</span>
              </div>
            )}
          </div>

          {/* Preview */}
          {processedText && (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-700">
                Preview
              </label>
              <div className="max-h-32 overflow-y-auto p-4 bg-gray-50 text-base font-mono leading-relaxed">
                {processedText}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 px-12 py-8 bg-gray-50">
          <button
            onClick={handleCancel}
            className="px-6 py-3 text-gray-600 hover:text-gray-800 font-semibold transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!processedText.trim()}
            className="px-6 py-3 bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors duration-200"
          >
            Save & Use
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Minimal Progress Visualization ---------------------------------------
function ProgressVisualization({ racers, isRacing, state, textLength }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const drawVisualization = useCallback((ctx, canvas) => {
    const { width, height } = canvas;
    
    // Clean background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Header area
    const headerHeight = 40;
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, width, headerHeight);
    
    // Subtle header divider
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();
    
    // Progress area
    const progressY = headerHeight;
    const progressHeight = height - headerHeight;
    const rowHeight = Math.max(50, progressHeight / racers.length);
    
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#374151';
    
    racers.forEach((racer, index) => {
      const y = progressY + index * rowHeight;
      
      // Alternating row background
      if (index % 2 === 0) {
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, y, width, rowHeight);
      }
      
      // Subtle row divider (only between rows)
      if (index > 0) {
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Name and stats
      ctx.fillStyle = racer.isPlayer ? '#1f2937' : '#6b7280';
      ctx.font = 'bold 14px system-ui';
      ctx.fillText(racer.name, 20, y + rowHeight/2 - 6);
      
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(`${Math.round(racer.wpm)} WPM`, 20, y + rowHeight/2 + 10);
      
      // Progress bar
      const barX = 120;
      const barWidth = width - 180;
      const barHeight = 6;
      const barY = y + (rowHeight - barHeight) / 2;
      
      // Progress bar background
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // Progress bar fill
      const progress = textLength > 0 ? Math.min(1, racer.progress / textLength) : 0;
      const fillWidth = barWidth * progress;
      
      ctx.fillStyle = racer.isPlayer ? '#374151' : '#9ca3af';
      ctx.fillRect(barX, barY, fillWidth, barHeight);
      
      // Progress percentage
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px system-ui';
      const percentage = Math.round(progress * 100);
      ctx.fillText(`${percentage}%`, width - 40, y + rowHeight/2 + 3);
    });
    
    // Header labels
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('Participant', 20, 25);
    ctx.fillText('Progress', 120, 25);
    ctx.fillText('Complete', width - 65, 25);
    
  }, [racers, textLength]);
  
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    drawVisualization(ctx, canvas);
    
    if (isRacing || state === "finished") {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [racers, isRacing, state, drawVisualization]);
  
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
    
    animate();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);
  
  return (
    <canvas
      ref={canvasRef}
      className="w-full bg-white"
      style={{ height: Math.max(180, racers.length * 55 + 45) }}
      role="img"
      aria-label="Race progress visualization"
    />
  );
}

// --- Performance Metrics Component ----------------------------------------
function PerformanceMetrics({ wpm, accuracy, errors, elapsedMs, state }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-8">
      <div className="text-center">
        <div className="text-5xl font-bold text-gray-700 mb-2">{Math.round(wpm)}</div>
        <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Words per Minute</div>
      </div>
      
      <div className="text-center">
        <div className="text-5xl font-bold text-gray-700 mb-2">{accuracy}%</div>
        <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Accuracy</div>
      </div>
      
      <div className="text-center">
        <div className="text-5xl font-bold text-gray-700 mb-2">{errors}</div>
        <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Errors</div>
      </div>
      
      <div className="text-center">
        <div className="text-5xl font-bold text-gray-700 mb-2">{fmtTime(elapsedMs)}</div>
        <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Time Elapsed</div>
      </div>
    </div>
  );
}

// --- Main Component --------------------------------------------------------
export default function TypeTutorRacerPOC() {
  const [library, setLibrary] = useState(() => loadLib());
  const [selectedBuiltIn, setSelectedBuiltIn] = useState(BUILT_IN[0].id);
  const [customText, setCustomText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("Built-in passage");

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
  const [wordResults, setWordResults] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [bots, setBots] = useState([]);
  const [tick, setTick] = useState(0);

  const inputRef = useRef(null);

  // Split text into words for word-based matching
  const words = useMemo(() => {
    return text.split(/\s+/).filter(word => word.length > 0);
  }, [text]);

  // Calculate progress and stats
  const correctWords = useMemo(() => {
    return wordResults.filter(result => result.correct).length;
  }, [wordResults]);

  const correctChars = useMemo(() => {
    const completedCorrectChars = wordResults
      .filter(result => result.correct)
      .reduce((total, result) => total + result.word.length + 1, 0);
    
    const currentWord = words[currentWordIndex] || "";
    let currentCorrectChars = 0;
    for (let i = 0; i < Math.min(currentTypedWord.length, currentWord.length); i++) {
      if (currentTypedWord[i] === currentWord[i]) {
        currentCorrectChars++;
      } else {
        break;
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

  // Create racers array for visualization
  const racers = useMemo(() => {
    const playerRacer = {
      id: 'player',
      name: 'You',
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

  // Focus management
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

  // Bot simulation
  useEffect(() => {
    if (state !== "running") return;
    let last = ms();
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
      return {
        id: uid(),
        name: sample(BOT_NAMES),
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

  // Input handler
  const onType = (e) => {
    const value = e.target.value;
    
    if (!startTime && state === "running") setStartTime(ms());
    
    if (value.endsWith(' ') || value.endsWith('\t')) {
      const typedWord = value.slice(0, -1).trim();
      const targetWord = words[currentWordIndex];
      
      if (targetWord) {
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
        
        e.target.value = "";
        
        if (currentWordIndex + 1 >= words.length) {
          setEndTime(ms());
          setState("finished");
          recordResult(true);
        }
      }
    } else {
      setCurrentTypedWord(value);
      
      if (strict) {
        const currentWord = words[currentWordIndex] || "";
        if (value.length > 0) {
          const lastChar = value[value.length - 1];
          const expectedChar = currentWord[value.length - 1];
          
          if (lastChar !== expectedChar) {
            e.target.value = value.slice(0, -1);
            setCurrentTypedWord(value.slice(0, -1));
            return;
          }
        }
      }
    }
  };

  // File upload
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

  // Library management
  const saveCurrentToLibrary = () => {
    const title = prompt("Save this passage as:", sourceTitle || "Custom passage");
    if (!title) return;
    const lib = loadLib();
    const entry = { id: uid(), title, text };
    const updated = [entry, ...lib].slice(0, 50);
    saveLib(updated);
    setLibrary(updated);
    alert("Passage saved to library.");
  };

  const handleCustomTextSave = (title, text) => {
    setCustomText(text);
    setSourceTitle(title);
    
    const lib = loadLib();
    const entry = { id: uid(), title, text };
    const updated = [entry, ...lib].slice(0, 50);
    saveLib(updated);
    setLibrary(updated);
  };

  // Text rendering
  const renderText = () => {
    if (!text) return (
      <div className="p-12 bg-gray-50 font-mono text-gray-500 leading-relaxed text-lg min-h-[200px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-bold mb-2 text-gray-600">No Passage Selected</div>
          <div>Choose a built-in passage or upload your own text to begin</div>
        </div>
      </div>
    );

    return (
      <div className="p-12 bg-white font-mono text-gray-800 leading-relaxed text-lg min-h-[200px]">
        {words.map((word, wordIndex) => {
          const isCompleted = wordIndex < currentWordIndex;
          const isCurrent = wordIndex === currentWordIndex;
          const wordResult = wordResults[wordIndex];
          
          let wordClass = "mr-2 px-1 py-0.5 transition-all duration-150";
          
          if (isCompleted) {
            wordClass += wordResult?.correct 
              ? " text-gray-600 bg-gray-100" 
              : " text-red-600 bg-red-50";
          } else if (isCurrent) {
            wordClass += " bg-gray-200";
            
            return (
              <span key={wordIndex} className={wordClass}>
                {word.split("").map((char, charIndex) => {
                  const isTyped = charIndex < currentTypedWord.length;
                  const isCorrect = isTyped && currentTypedWord[charIndex] === char;
                  const isWrong = isTyped && currentTypedWord[charIndex] !== char;
                  
                  let charClass = "transition-colors duration-100";
                  if (isCorrect) charClass += " text-gray-600";
                  else if (isWrong) charClass += " text-red-600 bg-red-200";
                  else if (charIndex === currentTypedWord.length) charClass += " bg-gray-600 text-white";
                  
                  return <span key={charIndex} className={charClass}>{char}</span>;
                })}
              </span>
            );
          } else {
            wordClass += " text-gray-400";
          }
          
          return <span key={wordIndex} className={wordClass}>{word}</span>;
        })}
      </div>
    );
  };

  const stats = loadStats();

  return (
    <div 
      className="min-h-screen w-full bg-white text-gray-800"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      <div className="max-w-6xl mx-auto px-8 py-12">
        
        {/* Header */}
        <header className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-700 mb-4">
            TypeTutor Racer
          </h1>
          <div className="w-24 h-0.5 bg-gray-300 mx-auto mb-6"></div>
          <p className="text-xl text-gray-600 font-medium">
            Professional Typing Training System
          </p>
        </header>

        {/* Race Status */}
        <div className="text-center mb-16 py-12 bg-gray-50">
          <div className="text-3xl font-bold text-gray-700 mb-2">
            {state === "counting" && `Starting in ${count}...`}
            {state === "running" && "Race in Progress"}
            {state === "finished" && "Race Completed"}
            {state === "idle" && "Ready to Start"}
          </div>
          {(state === "running" || state === "finished") && (
            <PerformanceMetrics 
              wpm={wpm} 
              accuracy={accuracy} 
              errors={errors} 
              elapsedMs={elapsedMs} 
              state={state} 
            />
          )}
        </div>

        {/* Race Configuration */}
        <section className="mb-16 py-12 bg-gray-50">
          <h2 className="text-2xl font-bold text-gray-700 mb-8 text-center">
            Race Configuration
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            <div className="text-center">
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                AI Opponents
              </label>
              <div className="flex items-center justify-center gap-4">
                <span className="text-3xl font-bold text-gray-700">{numBots}</span>
                <input 
                  type="range" 
                  min={0} 
                  max={5} 
                  value={numBots} 
                  onChange={(e) => setNumBots(Number(e.target.value))}
                  className="flex-1 max-w-24"
                />
              </div>
            </div>
            
            <div className="text-center">
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                Difficulty Level
              </label>
              <select 
                className="w-full px-0 py-2 bg-transparent border-0 border-b border-gray-300 focus:border-gray-600 outline-none text-lg text-center" 
                value={profile} 
                onChange={(e) => setProfile(e.target.value)}
              >
                <option value="chill">Beginner</option>
                <option value="balanced">Intermediate</option>
                <option value="speedy">Advanced</option>
              </select>
            </div>

            <div className="text-center">
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                Strict Mode
              </label>
              <label className="flex items-center justify-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={strict} 
                  onChange={(e) => setStrict(e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="text-lg">
                  {strict ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-center gap-6 mt-12">
            <button 
              onClick={startRace}
              disabled={!text}
              className="px-8 py-4 bg-gray-700 text-white font-semibold text-lg hover:bg-gray-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state === "running" ? "Restart Race" : "Start Race"}
            </button>
            
            <button 
              onClick={resetRace}
              className="px-6 py-4 text-gray-600 hover:text-gray-800 font-semibold text-lg transition-colors duration-200"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Progress Visualization */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-8 text-center">
            Race Progress
          </h2>
          <div className="bg-gray-50 p-1">
            <ProgressVisualization 
              racers={racers} 
              isRacing={state === "running"} 
              state={state}
              textLength={text.length}
            />
          </div>
        </section>

        {/* Typing Area */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-8 text-center">
            Typing Area
          </h2>
          
          <div className="mb-8 bg-gray-50 overflow-hidden">
            {renderText()}
          </div>
          
          <input
            ref={inputRef}
            disabled={state !== "running"}
            value={currentTypedWord}
            onChange={onType}
            placeholder={state === "running" ? "Start typing here..." : "Click 'Start Race' to begin"}
            className="w-full px-6 py-6 bg-gray-50 border-0 outline-none text-xl font-mono disabled:opacity-50 transition-colors duration-200"
            aria-label="Type the displayed passage here"
          />
          
          <div className="flex justify-between items-center mt-6 text-sm text-gray-500">
            <span>
              {strict ? 'Strict Mode: Incorrect characters blocked' : 'Standard Mode: Type as fast as possible'}
            </span>
            {text && (
              <span>
                Progress: {currentWordIndex}/{words.length} words
              </span>
            )}
          </div>
        </section>

        {/* Passage Management */}
        <section className="mb-16 py-12 bg-gray-50">
          <h2 className="text-2xl font-bold text-gray-700 mb-8 text-center">
            Passage Library
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                Select Passage
              </label>
              <select
                className="w-full px-0 py-3 bg-transparent border-0 border-b border-gray-300 focus:border-gray-600 outline-none text-lg"
                value={customText ? `custom-${sourceTitle}` : selectedBuiltIn}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.startsWith('custom-')) {
                    const customTitle = value.replace('custom-', '');
                    const item = library.find(x => x.title === customTitle);
                    if (item) {
                      setCustomText(item.text);
                      setSourceTitle(item.title);
                      setSelectedBuiltIn("");
                    }
                  } else {
                    setSelectedBuiltIn(value);
                    setCustomText("");
                    setSourceTitle("Built-in passage");
                  }
                }}
              >
                <optgroup label="Built-in Educational Passages">
                  {BUILT_IN.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </optgroup>
                {library.length > 0 && (
                  <optgroup label="Custom Passages">
                    {library.map((item) => (
                      <option key={item.id} value={`custom-${item.title}`}>
                        {item.title}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-4">
                Upload Text File
              </label>
              <input
                type="file"
                accept=".txt,.md"
                className="w-full text-base py-3 bg-transparent border-0 border-b border-gray-300 focus:border-gray-600 outline-none"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="flex justify-center gap-6">
            <button
              className="px-6 py-3 bg-gray-700 text-white hover:bg-gray-800 font-semibold transition-colors duration-200"
              onClick={() => setShowCustomModal(true)}
            >
              Add Custom Text
            </button>
            
            <button 
              className="px-6 py-3 text-gray-600 hover:text-gray-800 font-semibold transition-colors duration-200" 
              onClick={saveCurrentToLibrary}
              disabled={!text}
            >
              Save to Library
            </button>
          </div>
        </section>

        {/* Performance History */}
        <section className="py-12 bg-gray-50">
          <h2 className="text-2xl font-bold text-gray-700 mb-8 text-center">
            Performance History
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {(stats.history || []).slice(0, 6).map((h) => (
              <div key={h.id} className="p-8 bg-white">
                <div className="font-bold text-lg mb-2 text-gray-700">{h.title}</div>
                <div className="text-sm text-gray-500 mb-6">
                  {new Date(h.date).toLocaleDateString()}
                </div>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-700">{h.wpm}</div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">WPM</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-700">{h.accuracy}%</div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">Accuracy</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-700">#{h.placing}</div>
                    <div className="text-xs text-gray-500 uppercase font-semibold">Place</div>
                  </div>
                </div>
              </div>
            ))}
            {(stats.history || []).length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-16">
                <div className="text-xl font-semibold mb-2">No Performance Data</div>
                <div>Complete your first race to see results.</div>
              </div>
            )}
          </div>
        </section>

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