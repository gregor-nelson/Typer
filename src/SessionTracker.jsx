import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

// --- Utility helpers from App.jsx ------------------------------------------------------
const ms = () => new Date().getTime();
const uid = () => Math.random().toString(36).slice(2, 10);
const calcWPM = (correctChars, elapsedMs) => {
  if (!elapsedMs) return 0;
  return Math.round(((correctChars / 5) / (elapsedMs / 60000)) * 10) / 10;
};
const fmtTime = (msVal) => {
  const s = Math.floor(msVal / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

// --- Session Storage Schema --------------------------------------------------------
const LS_SESSION = {
  CURRENT: "typeracer_session_v1",
  HISTORY: "typeracer_sessions_v1",
};

const loadCurrentSession = () => {
  try { 
    const data = JSON.parse(localStorage.getItem(LS_SESSION.CURRENT) || "null");
    return data && data.isActive ? data : null;
  } catch { return null; }
};

const saveCurrentSession = (session) => 
  localStorage.setItem(LS_SESSION.CURRENT, JSON.stringify(session || null));

const loadSessionHistory = () => {
  try { 
    return JSON.parse(localStorage.getItem(LS_SESSION.HISTORY) || "{\"sessions\":[], \"metadata\":{}}"); 
  } catch { 
    return { sessions: [], metadata: {} }; 
  }
};

const saveSessionHistory = (history) => 
  localStorage.setItem(LS_SESSION.HISTORY, JSON.stringify(history || { sessions: [], metadata: {} }));

// --- Session Management Functions --------------------------------------------------
const createNewSession = () => ({
  sessionId: uid(),
  startTime: new Date().toISOString(),
  endTime: null,
  isActive: true,
  totalRaces: 0,
  totalTimeSpent: 0,
  averageWPM: 0,
  peakWPM: 0,
  consistencyScore: 100,
  improvementRate: 0,
  passagePreferences: {
    avgLength: 0,
    favoriteTypes: [],
    mostChallenging: [],
  },
  races: [],
  wpmHistory: [],
  insights: {
    bestStreak: { races: 0, avgWPM: 0 },
    worstStreak: { races: 0, avgWPM: 0 },
    timeOfDayPattern: 'unknown',
    optimalRaceLength: 600,
    breakPatterns: { avgBreakMs: 0, breaksPerHour: 0 },
  },
  lastPersisted: ms(),
  dirty: false,
});

const calculateSessionStats = (session) => {
  if (session.races.length === 0) return session;
  
  const races = session.races;
  const totalWPM = races.reduce((sum, race) => sum + race.wpm, 0);
  const avgWPM = totalWPM / races.length;
  const peakWPM = Math.max(...races.map(r => r.wpm));
  
  // Calculate consistency (inverse of coefficient of variation)
  const wpmValues = races.map(r => r.wpm);
  const variance = wpmValues.reduce((sum, wpm) => sum + Math.pow(wpm - avgWPM, 2), 0) / wpmValues.length;
  const stdDev = Math.sqrt(variance);
  const consistency = avgWPM > 0 ? Math.max(0, 100 - (stdDev / avgWPM) * 100) : 100;
  
  // Calculate improvement rate (WPM change from first to last race)
  const improvementRate = races.length > 1 ? 
    (races[races.length - 1].wpm - races[0].wpm) / races.length : 0;
    
  // Calculate session duration
  const totalTimeSpent = races.length > 1 ? 
    new Date(races[races.length - 1].timestamp) - new Date(races[0].timestamp) : 0;
  
  return {
    ...session,
    totalRaces: races.length,
    totalTimeSpent,
    averageWPM: Math.round(avgWPM * 10) / 10,
    peakWPM: Math.round(peakWPM * 10) / 10,
    consistencyScore: Math.round(consistency),
    improvementRate: Math.round(improvementRate * 10) / 10,
    wpmHistory: races.map((race, i) => ({ race: i + 1, wpm: race.wpm })),
  };
};

const endSession = (session) => {
  const endedSession = calculateSessionStats({
    ...session,
    endTime: new Date().toISOString(),
    isActive: false,
  });
  
  // Add to session history
  const history = loadSessionHistory();
  const sessionSummary = {
    id: endedSession.sessionId,
    startTime: endedSession.startTime,
    endTime: endedSession.endTime,
    duration: endedSession.totalTimeSpent,
    totalRaces: endedSession.totalRaces,
    summary: {
      avgWPM: endedSession.averageWPM,
      peakWPM: endedSession.peakWPM,
      improvement: endedSession.improvementRate,
      consistency: endedSession.consistencyScore,
      totalChars: endedSession.races.reduce((sum, r) => sum + (r.length || 0), 0),
      accuracy: endedSession.races.length > 0 ? 
        endedSession.races.reduce((sum, r) => sum + r.accuracy, 0) / endedSession.races.length : 0,
    },
    insights: generateSessionInsights(endedSession),
  };
  
  // Keep only last 15 sessions
  const updatedSessions = [sessionSummary, ...history.sessions].slice(0, 15);
  saveSessionHistory({
    sessions: updatedSessions,
    metadata: {
      ...history.metadata,
      totalSessions: (history.metadata.totalSessions || 0) + 1,
      lastCleanup: new Date().toISOString(),
    }
  });
  
  // Clear current session
  saveCurrentSession(null);
  return endedSession;
};

// --- Advanced Analytics Functions ----------------------------------------------
const generateSessionInsights = (session) => {
  if (session.races.length === 0) return ["Good practice session"];
  
  const insights = [];
  const races = session.races;
  
  // Performance trend analysis
  if (session.improvementRate > 2) {
    insights.push({ type: 'improvement', text: `Improving steadily: +${Math.round(session.improvementRate)} WPM per race`, icon: 'trend-up' });
  } else if (session.improvementRate < -2) {
    insights.push({ type: 'decline', text: `Performance declining: ${Math.abs(Math.round(session.improvementRate))} WPM per race`, icon: 'trend-down' });
  } else if (races.length >= 5) {
    insights.push({ type: 'stable', text: 'Performance stabilizing - good consistency', icon: 'equals' });
  }
  
  // Consistency analysis
  if (session.consistencyScore > 90) {
    insights.push({ type: 'excellent', text: 'Exceptional consistency - very steady typing rhythm', icon: 'target' });
  } else if (session.consistencyScore > 75) {
    insights.push({ type: 'good', text: 'Good consistency - maintaining steady performance', icon: 'check-circle' });
  } else if (session.consistencyScore < 50) {
    insights.push({ type: 'warning', text: 'High variation - try focusing on steady rhythm', icon: 'warning-circle' });
  }
  
  // Passage length preference analysis
  const avgLength = races.reduce((sum, r) => sum + (r.length || 0), 0) / races.length;
  const optimalLength = findOptimalPassageLength(races);
  if (optimalLength && Math.abs(avgLength - optimalLength) > 100) {
    insights.push({ 
      type: 'preference', 
      text: `Best performance on ${optimalLength < 500 ? 'shorter' : optimalLength > 800 ? 'longer' : 'medium'} passages`, 
      icon: 'text-aa' 
    });
  }
  
  // Error pattern analysis
  const totalErrors = races.reduce((sum, r) => sum + (r.errors || 0), 0);
  const errorRate = totalErrors / races.length;
  if (errorRate < 1) {
    insights.push({ type: 'excellent', text: 'Excellent accuracy - very few errors', icon: 'check-circle' });
  } else if (errorRate > 5) {
    insights.push({ type: 'warning', text: 'Focus on accuracy - slow down slightly to reduce errors', icon: 'warning-circle' });
  }
  
  // Session length achievements
  if (session.totalRaces >= 20) {
    insights.push({ type: 'achievement', text: 'Marathon session! Outstanding dedication', icon: 'trophy' });
  } else if (session.totalRaces >= 10) {
    insights.push({ type: 'achievement', text: 'Extended practice session - great persistence', icon: 'medal' });
  } else if (session.totalRaces >= 5) {
    insights.push({ type: 'good', text: 'Solid practice session', icon: 'thumbs-up' });
  }
  
  // Time pattern analysis (hour of day)
  const timePattern = analyzeTimePattern(races);
  if (timePattern) {
    insights.push({ type: 'info', text: timePattern, icon: 'clock' });
  }
  
  // Peak performance detection
  const peakRace = races.reduce((max, race) => race.wpm > max.wpm ? race : max, races[0]);
  if (peakRace.wpm > session.averageWPM + 10) {
    insights.push({ 
      type: 'peak', 
      text: `Peak performance: ${Math.round(peakRace.wpm)} WPM - you can achieve this consistently!`, 
      icon: 'lightning' 
    });
  }
  
  return insights.length > 0 ? insights : [{ type: 'default', text: 'Good practice session', icon: 'check' }];
};

const findOptimalPassageLength = (races) => {
  if (races.length < 3) return null;
  
  // Group by length ranges and find best performance
  const lengthGroups = {
    short: races.filter(r => r.length <= 400),
    medium: races.filter(r => r.length > 400 && r.length <= 800),
    long: races.filter(r => r.length > 800)
  };
  
  const avgWPM = {
    short: lengthGroups.short.reduce((sum, r) => sum + r.wpm, 0) / lengthGroups.short.length,
    medium: lengthGroups.medium.reduce((sum, r) => sum + r.wpm, 0) / lengthGroups.medium.length,
    long: lengthGroups.long.reduce((sum, r) => sum + r.wpm, 0) / lengthGroups.long.length
  };
  
  const bestCategory = Object.entries(avgWPM)
    .filter(([key, wpm]) => !isNaN(wpm))
    .reduce((max, [key, wpm]) => wpm > max[1] ? [key, wpm] : max, ['', 0]);
  
  const lengthMap = { short: 300, medium: 600, long: 1000 };
  return lengthMap[bestCategory[0]] || null;
};

const analyzeTimePattern = (races) => {
  if (races.length < 3) return null;
  
  const hourGroups = {};
  races.forEach(race => {
    const hour = new Date(race.timestamp).getHours();
    const period = hour < 6 ? 'early' : 
                   hour < 12 ? 'morning' : 
                   hour < 17 ? 'afternoon' : 
                   hour < 21 ? 'evening' : 'night';
    
    if (!hourGroups[period]) hourGroups[period] = [];
    hourGroups[period].push(race.wpm);
  });
  
  // Find best performing time period
  let bestPeriod = null;
  let bestAvg = 0;
  
  Object.entries(hourGroups).forEach(([period, wpms]) => {
    if (wpms.length >= 2) {
      const avg = wpms.reduce((sum, wpm) => sum + wpm, 0) / wpms.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestPeriod = period;
      }
    }
  });
  
  if (bestPeriod && bestAvg > 0) {
    return `Best performance in ${bestPeriod} sessions`;
  }
  
  return null;
};

const calculateWPMProgression = (keystrokeData, totalTime) => {
  if (keystrokeData.length === 0) return [];
  
  const progressionPoints = [];
  const intervalMs = Math.max(1000, totalTime / 20); // 20 data points max
  
  for (let time = intervalMs; time <= totalTime; time += intervalMs) {
    const keystrokesAtTime = keystrokeData.filter(k => k.timestamp <= time && k.correct);
    const correctChars = keystrokesAtTime.length;
    const wpmAtTime = calcWPM(correctChars, time);
    
    progressionPoints.push({
      timeMs: time,
      wpm: Math.round(wpmAtTime * 10) / 10,
      correctChars
    });
  }
  
  return progressionPoints;
};

// --- Session Insights Component -------------------------------------------
function SessionInsight({ insight }) {
  const getColorClass = (type) => {
    switch (type) {
      case 'improvement':
      case 'excellent':
      case 'good':
        return 'text-green-600';
      case 'decline':
      case 'warning':
        return 'text-amber-600';
      case 'achievement':
      case 'peak':
        return 'text-purple-600';
      case 'info':
      case 'preference':
        return 'text-blue-600';
      case 'stable':
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={`flex items-center gap-2 text-xs ${getColorClass(insight.type)}`}>
      <i className={`ph ph-${insight.icon} text-sm`}></i>
      <span>{insight.text}</span>
    </div>
  );
}

// --- Session Progress Panel Component --------------------------------------
function SessionProgressPanel({ session, isVisible, onToggle }) {
  if (!session || !isVisible) return null;

  const sessionDuration = session.races.length > 0 && session.races[0] ? 
    ms() - new Date(session.startTime).getTime() : 0;
    
  const recentRaces = session.races.slice(-5); // Last 5 races
  const trend = session.races.length > 1 ? 
    session.races[session.races.length - 1].wpm - session.races[0].wpm : 0;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-gray-50 border-t border-gray-200 p-4 sm:p-6 text-sm overflow-hidden"
    >
      {/* Session Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-semibold text-gray-700 text-sm sm:text-base">Session Active</span>
          </div>
          <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <i className="ph ph-clock text-xs"></i>
              <span>{fmtTime(sessionDuration)}</span>
            </div>
            <div className="flex items-center gap-1">
              <i className="ph ph-flag text-xs"></i>
              <span>{session.totalRaces} races</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 sm:p-0"
          aria-label="Close session panel"
        >
          <i className="ph ph-x text-lg sm:text-xl"></i>
        </button>
      </div>

      {/* Session Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-4">
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-bold text-gray-700">
            {session.averageWPM || 0}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Avg WPM</div>
        </div>
        
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-bold text-gray-700">
            {session.peakWPM || 0}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Peak WPM</div>
        </div>
        
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-bold text-gray-700">
            {session.consistencyScore || 100}%
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Consistency</div>
        </div>
        
        <div className="text-center">
          <div className={`text-xl sm:text-2xl font-bold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '+' : ''}{Math.round(trend * 10) / 10}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Improvement</div>
        </div>
      </div>

      {/* Recent Performance and Insights */}
      {(recentRaces.length > 0 || session.races.length >= 2) && (
        <div className="border-t border-gray-200 pt-3">
          <div className="grid grid-cols-10 gap-6">
            
            {/* Recent Performance Trend */}
            {recentRaces.length > 0 && (
              <div className="col-span-3">
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-600 mb-2">
                  <i className="ph ph-chart-bar text-sm"></i>
                  <span>Recent Races</span>
                </div>
                <div className="flex items-center gap-1">
                  {recentRaces.map((race, i) => {
                    return (
                      <div key={race.id || i} className="flex items-center gap-2 text-xs text-gray-600">
                        <i className="ph ph-circle-fill text-gray-600" style={{ fontSize: '6px' }}></i>
                        <span>{Math.round(race.wpm)} WPM</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Session Insights */}
            {session.races.length >= 2 && (() => {
              const insights = generateSessionInsights(session);
              return (
                <div className="col-span-7">
                  <div className="flex items-center gap-1 text-xs font-semibold text-gray-600 mb-2">
                    <i className="ph ph-lightbulb text-sm"></i>
                    <span>Session Insights</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    {insights.slice(0, 3).map((insight, index) => (
                      <SessionInsight key={index} insight={insight} />
                    ))}
                  </div>
                </div>
              );
            })()}
            
          </div>
        </div>
      )}
    </motion.div>
  );
}

// --- Main Session Tracker Hook and Component -------------------------------
export function useSessionTracker() {
  const [currentSession, setCurrentSession] = useState(() => {
    const existing = loadCurrentSession();
    return existing || createNewSession();
  });
  
  const sessionTimeoutRef = useRef(null);

  // Session persistence effect - auto-save every 30 seconds
  useEffect(() => {
    const persistSession = () => {
      if (currentSession && currentSession.dirty) {
        const updatedSession = {
          ...currentSession,
          lastPersisted: ms(),
          dirty: false,
        };
        saveCurrentSession(updatedSession);
        setCurrentSession(updatedSession);
      }
    };

    const interval = setInterval(persistSession, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [currentSession]);

  // Session timeout - end session after 30 minutes of inactivity
  const resetSessionTimeout = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }
    sessionTimeoutRef.current = setTimeout(() => {
      if (currentSession && currentSession.isActive) {
        endSession(currentSession);
        setCurrentSession(createNewSession());
      }
    }, 30 * 60 * 1000); // 30 minutes
  }, [currentSession]);

  const recordRace = useCallback((raceResult) => {
    if (!currentSession || !currentSession.isActive) return;

    const updatedSession = {
      ...currentSession,
      races: [...currentSession.races, raceResult],
      dirty: true,
    };
    
    // Recalculate session stats
    const sessionWithStats = calculateSessionStats(updatedSession);
    setCurrentSession(sessionWithStats);
    
    // Immediate save after race completion
    saveCurrentSession(sessionWithStats);
    
    // Reset activity timeout
    resetSessionTimeout();
  }, [currentSession, resetSessionTimeout]);

  const endCurrentSession = useCallback(() => {
    if (currentSession && currentSession.isActive) {
      const endedSession = endSession(currentSession);
      setCurrentSession(createNewSession());
      return endedSession;
    }
  }, [currentSession]);

  return {
    currentSession,
    recordRace,
    endCurrentSession,
    resetSessionTimeout,
  };
}

// --- Session Tracker Component (for UI integration) ------------------------
export function SessionTracker({ children, onRaceComplete }) {
  const { currentSession, recordRace, resetSessionTimeout } = useSessionTracker();
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  // Enhanced race recording with keystroke analytics
  const enhancedRecordRace = useCallback((raceData, keystrokeData = []) => {
    const enhancedRace = {
      ...raceData,
      keystrokeAnalytics: keystrokeData.length > 0 ? {
        totalKeystrokes: keystrokeData.length,
        correctKeystrokes: keystrokeData.filter(k => k.correct).length,
        avgTiming: keystrokeData.length > 1 ? 
          keystrokeData.reduce((sum, k) => sum + (k.timingMs || 0), 0) / (keystrokeData.length - 1) : 0,
        errorPatterns: analyzeKeystrokeErrors(keystrokeData),
      } : null,
    };
    
    recordRace(enhancedRace);
    resetSessionTimeout();
    
    if (onRaceComplete) {
      onRaceComplete(enhancedRace, currentSession);
    }
  }, [recordRace, resetSessionTimeout, onRaceComplete, currentSession]);

  return (
    <>
      {children({ 
        currentSession, 
        recordRace: enhancedRecordRace,
        showSessionPanel,
        setShowSessionPanel,
      })}
      
      <SessionProgressPanel 
        session={currentSession}
        isVisible={showSessionPanel}
        onToggle={() => setShowSessionPanel(false)}
      />
    </>
  );
}

// Helper function for keystroke error analysis
const analyzeKeystrokeErrors = (keystrokeData) => {
  const errorPatterns = {};
  keystrokeData.filter(k => !k.correct).forEach(k => {
    const expected = k.expected || '';
    const typed = k.char || '';
    if (!errorPatterns[expected]) errorPatterns[expected] = {};
    errorPatterns[expected][typed] = (errorPatterns[expected][typed] || 0) + 1;
  });
  return errorPatterns;
};

export default SessionTracker;