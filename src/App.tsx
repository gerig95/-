/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext, useRef, Component } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  addDoc, 
  serverTimestamp,
  Timestamp,
  User
} from './firebase';
import { 
  Search, 
  MessageSquare, 
  Video, 
  Phone, 
  Flame, 
  LogOut, 
  User as UserIcon, 
  Send, 
  X, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Smile,
  Download,
  Settings,
  Palette,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ExternalLink,
  History,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ar } from 'date-fns/locale';

// --- Types ---
interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  lastSeen: Timestamp;
  searchKeywords: string[];
  isPrivate?: boolean;
  theme?: string;
  chatBackground?: string;
}

interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: Timestamp;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
  reactions?: Record<string, string[]>;
}

interface Streak {
  id: string;
  user1: string;
  user2: string;
  count: number;
  lastInteraction: Timestamp;
}

interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  status: 'ringing' | 'accepted' | 'rejected' | 'ended';
  offer?: any;
  answer?: any;
}

const THEMES = [
  { id: 'orange', name: 'برتقالي', color: 'bg-orange-500', hover: 'hover:bg-orange-600' },
  { id: 'blue', name: 'أزرق', color: 'bg-blue-500', hover: 'hover:bg-blue-600' },
  { id: 'green', name: 'أخضر', color: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
  { id: 'purple', name: 'بنفسجي', color: 'bg-violet-500', hover: 'hover:bg-violet-600' },
  { id: 'rose', name: 'وردي', color: 'bg-rose-500', hover: 'hover:bg-rose-600' },
];

// --- Context ---
const AuthContext = createContext<{
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}>({ user: null, profile: null, loading: true });

const useAuth = () => useContext(AuthContext);

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "حدث خطأ ما. يرجى المحاولة مرة أخرى.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '');
        if (parsed.error.includes('permission-denied')) {
          message = "عذراً، ليس لديك الصلاحية للقيام بهذا الإجراء.";
        }
      } catch (e) {}

      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-4">{message}</h2>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all"
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Login = () => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = navigator.onLine;

  const handleLogin = async () => {
    if (!isOnline) {
      setError("لا يمكن تسجيل الدخول بدون اتصال بالإنترنت.");
      return;
    }
    setIsLoggingIn(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      const profileData = {
        uid: user.uid,
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL || '',
        lastSeen: serverTimestamp(),
        searchKeywords: (user.displayName || '').toLowerCase().split(' '),
        isPrivate: false
      };

      if (!userSnap.exists()) {
        await setDoc(userRef, profileData);
      } else {
        await updateDoc(userRef, { lastSeen: serverTimestamp() });
      }
    } catch (error: any) {
      if (error.message && error.message.includes('{"error":')) {
        // This is our custom Firestore error, rethrow it to be caught by ErrorBoundary
        throw error;
      }
      console.error('Login error:', error);
      if (error.code === 'auth/popup-blocked') {
        setError("تم حظر النافذة المنبثقة. يرجى السماح بالمنبثقات لهذا الموقع.");
      } else {
        setError("حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-8 max-w-md w-full"
      >
        <div className="relative inline-block">
          <div className="absolute -inset-4 bg-orange-500/20 blur-3xl rounded-full" />
          <img src="https://img.icons8.com/fluency/192/messaging.png" className="w-24 h-24 relative mx-auto" alt="Note Logo" />
        </div>
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tighter">نوت</h1>
          <p className="text-zinc-400 text-lg">دردشة فورية، مكالمات فيديو، وستريك.</p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full py-4 px-6 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 text-lg shadow-xl shadow-orange-500/10 disabled:opacity-50"
          >
            {isLoggingIn ? (
              <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <img src="https://www.google.com/favicon.ico" className="w-6 h-6 opacity-50" alt="Google" />
            )}
            {isLoggingIn ? 'جاري التحميل...' : 'الدخول إلى نوت'}
          </button>
          
          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm font-medium"
            >
              {error}
            </motion.p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const CallHistoryModal = ({ onClose, otherUid }: { onClose: () => void, otherUid?: string }) => {
  const [calls, setCalls] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    return onSnapshot(q, (snapshot) => {
      setCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'calls'));
  }, [user]);

  const filteredCalls = otherUid 
    ? calls.filter(c => c.participants.includes(otherUid))
    : calls;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-zinc-900 w-full max-w-md rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-xl">
              <History className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold">سجل المكالمات</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {filteredCalls.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <PhoneOff className="w-12 h-12 text-zinc-700 mx-auto" />
              <p className="text-zinc-500">لا يوجد سجل مكالمات بعد</p>
            </div>
          ) : (
            filteredCalls.map((call) => (
              <div key={call.id} className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl border border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${call.type === 'video' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                    {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">
                      {call.type === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية'}
                    </h4>
                    <p className="text-[10px] text-zinc-500">
                      {call.createdAt ? format(call.createdAt.toDate(), 'PPpp', { locale: ar }) : 'جاري التحميل...'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${
                    call.status === 'ended' ? 'bg-zinc-700 text-zinc-400' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {call.status === 'ended' ? 'انتهت' : 'فائتة'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { user, profile } = useAuth();
  const [bgUrl, setBgUrl] = useState(profile?.chatBackground || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleThemeSelect = async (themeId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { theme: themeId });
    } catch (err) {
      console.error('Theme update error:', err);
    }
  };

  const handleSaveBackground = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { chatBackground: bgUrl });
      onClose();
    } catch (err) {
      console.error('Background update error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-zinc-900 w-full max-w-md rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-xl">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold">الإعدادات والتخصيص</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Themes */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <Palette className="w-4 h-4" />
              <h3 className="text-sm font-bold uppercase tracking-wider">سمة الألوان</h3>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  className={`aspect-square rounded-2xl ${theme.color} flex items-center justify-center transition-transform hover:scale-110 active:scale-95 relative`}
                  title={theme.name}
                >
                  {profile?.theme === theme.id && (
                    <div className="bg-white/20 p-1 rounded-full backdrop-blur-sm">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Chat Background */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <ImageIcon className="w-4 h-4" />
              <h3 className="text-sm font-bold uppercase tracking-wider">خلفية الدردشة</h3>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">أدخل رابط صورة (URL) أو لون (مثال: #000000)</p>
              <input 
                type="text"
                value={bgUrl}
                onChange={(e) => setBgUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 transition-colors"
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => setBgUrl('')}
                  className="flex-1 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  إزالة الخلفية
                </button>
                <button 
                  onClick={handleSaveBackground}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-white text-black rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'جاري الحفظ...' : 'حفظ الخلفية'}
                </button>
              </div>
            </div>
          </section>

        </div>
      </motion.div>
    </motion.div>
  );
};

const UserAvatar = ({ photoURL, displayName, size = "md" }: { photoURL?: string, displayName?: string, size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-20 h-20"
  };
  
  return (
    <div className={`${sizes[size]} rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700`}>
      {photoURL ? (
        <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-500">
          <UserIcon className="w-1/2 h-1/2" />
        </div>
      )}
    </div>
  );
};

const StreakBadge = ({ count }: { count: number }) => {
  const { profile } = useAuth();
  if (count <= 0) return null;

  const theme = THEMES.find(t => t.id === profile?.theme) || THEMES[0];
  const themeColor = theme.color;
  const themeText = themeColor.replace('bg-', 'text-');
  const themeBgSoft = themeColor.replace('bg-', 'bg-') + '/10';
  const themeBorderSoft = themeColor.replace('bg-', 'border-') + '/20';

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${themeBgSoft} ${themeText} ${themeBorderSoft}`}>
      <Flame className="w-3 h-3 fill-current" />
      {count}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const theme = THEMES.find(t => t.id === profile?.theme) || THEMES[0];
  const themeColor = theme.color;
  const themeHover = theme.hover;
  const themeText = themeColor.replace('bg-', 'text-');
  const themeBorder = themeColor.replace('bg-', 'border-');
  const themeBgSoft = themeColor.replace('bg-', 'bg-') + '/10';
  const themeBorderSoft = themeColor.replace('bg-', 'border-') + '/20';

  const togglePrivateMode = async () => {
    if (!user || !profile) return;
    const newStatus = !isPrivateMode;
    setIsPrivateMode(newStatus);
    try {
      await updateDoc(doc(db, 'users', user.uid), { isPrivate: newStatus });
    } catch (err) {
      console.error('Update privacy error:', err);
    }
  };

  useEffect(() => {
    if (profile) {
      setIsPrivateMode(profile.isPrivate || false);
    }
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setLoadingTimeout(true);
    }, 10000); // 10 seconds timeout

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, `users/${u.uid}`));
      } else {
        setProfile(null);
      }
      setLoading(false);
      clearTimeout(timer);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // Listen for active calls (incoming or outgoing)
  useEffect(() => {
    if (!user) return;
    
    let incomingCall: Call | null = null;
    let outgoingCall: Call | null = null;

    const updateActiveCall = () => {
      // If we have an incoming call, it takes priority
      // If not, show the outgoing call
      setActiveCall(incomingCall || outgoingCall);
    };

    // Query for incoming calls
    const qIncoming = query(
      collection(db, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'ringing'),
      limit(1)
    );

    // Query for outgoing calls
    const qOutgoing = query(
      collection(db, 'calls'),
      where('callerId', '==', user.uid),
      where('status', '==', 'ringing'),
      limit(1)
    );

    const unsubIncoming = onSnapshot(qIncoming, (snapshot) => {
      incomingCall = !snapshot.empty ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Call : null;
      updateActiveCall();
    }, (err) => handleFirestoreError(err, OperationType.GET, 'calls (incoming)'));

    const unsubOutgoing = onSnapshot(qOutgoing, (snapshot) => {
      outgoingCall = !snapshot.empty ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Call : null;
      updateActiveCall();
    }, (err) => handleFirestoreError(err, OperationType.GET, 'calls (outgoing)'));

    return () => {
      unsubIncoming();
      unsubOutgoing();
    };
  }, [user]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
      <div className={`w-12 h-12 border-4 ${themeBorder} border-t-transparent rounded-full animate-spin mb-6`} />
      {loadingTimeout && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div className="flex flex-col items-center gap-4">
            {!isOnline && <img src="https://img.icons8.com/fluency/96/wifi-off.png" className="w-16 h-16 opacity-50" alt="Offline" />}
            <p className="text-zinc-400">
              {!isOnline 
                ? "أنت غير متصل بالإنترنت حالياً. يرجى التحقق من اتصالك." 
                : "يبدو أن التحميل يستغرق وقتاً طويلاً..."}
            </p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 transition-all"
          >
            إعادة المحاولة
          </button>
        </motion.div>
      )}
    </div>
  );

  return (
    <ErrorBoundary>
      {!isOnline && (
        <motion.div 
          initial={{ y: -50 }}
          animate={{ y: 0 }}
          className="fixed top-0 left-0 right-0 z-[200] bg-red-600 text-white py-2 px-4 text-center text-sm font-bold flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-4 h-4" />
          أنت الآن غير متصل بالإنترنت. قد لا تعمل بعض الميزات بشكل صحيح.
        </motion.div>
      )}
      {!user ? (
        <Login />
      ) : (
        <AuthContext.Provider value={{ user, profile, loading }}>
          <div className="min-h-screen bg-[#0a0a0a] text-white flex overflow-hidden font-sans">
            {/* Sidebar */}
            <div className={`${isSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-full md:w-80 lg:w-96'} border-r border-zinc-800 flex flex-col transition-all duration-300 ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
              <header className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar photoURL={profile?.photoURL} displayName={profile?.displayName} />
                  <div>
                    <h2 className="font-bold leading-tight">{profile?.displayName}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">متصل الآن</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isPrivateMode && (
                    <button 
                      onClick={() => setShowSearch(true)}
                      className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
                      title="بحث"
                    >
                      <Search className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={togglePrivateMode}
                    className={`p-2 rounded-full transition-colors ${isPrivateMode ? `${themeText} ${themeBgSoft}` : 'text-zinc-500 hover:bg-zinc-800'}`}
                    title={isPrivateMode ? "الوضع الخاص مفعل" : "تفعيل الوضع الخاص"}
                  >
                    <UserIcon className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white"
                    title="الإعدادات"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => auth.signOut()}
                    className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-red-500"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <ChatList onSelectChat={setActiveChatId} activeChatId={activeChatId} />
              </div>
            </div>

            {/* Main Content */}
            <div className={`flex-1 flex flex-col ${!activeChatId ? 'hidden md:flex' : 'flex'}`}>
              {activeChatId ? (
                <ChatRoom 
                  chatId={activeChatId} 
                  onBack={() => setActiveChatId(null)} 
                  isSidebarCollapsed={isSidebarCollapsed}
                  setIsSidebarCollapsed={setIsSidebarCollapsed}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
                  <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <MessageSquare className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">اختر محادثة للبدء</h3>
                  <p className="max-w-xs">ابحث عن أصدقاء أو اختر محادثة حالية للمتابعة.</p>
                </div>
              )}
            </div>

            {/* Overlays */}
            <AnimatePresence>
              {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
              {showSearch && (
                <UserSearch onClose={() => setShowSearch(false)} onSelectChat={(id) => {
                  setActiveChatId(id);
                  setShowSearch(false);
                }} />
              )}
              {activeCall && (
                <CallOverlay call={activeCall} onClose={() => setActiveCall(null)} />
              )}
            </AnimatePresence>
          </div>

          <style>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #27272a;
              border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #3f3f46;
            }
          `}</style>
        </AuthContext.Provider>
      )}
    </ErrorBoundary>
  );
}

// --- Sub-components ---

const InstallButton = ({ variant = "compact" }: { variant?: "compact" | "full" }) => {
  const { profile } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const theme = THEMES.find(t => t.id === profile?.theme) || THEMES[0];
  const themeColor = theme.color;
  const themeText = themeColor.replace('bg-', 'text-');
  const themeBgSoft = themeColor.replace('bg-', 'bg-') + '/10';
  const themeBorderSoft = themeColor.replace('bg-', 'border-') + '/20';

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('Installation error:', err);
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  if (isStandalone) {
    return (
      <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px] bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
        <Check className="w-3 h-3" />
        مثبت
      </div>
    );
  }

  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  return (
    <>
      {variant === "full" ? (
        <button 
          onClick={handleInstall}
          className={`w-full flex flex-col items-center justify-center gap-3 p-6 ${themeBgSoft} ${themeText} rounded-3xl font-bold hover:${themeColor} hover:text-white transition-all border-2 ${themeBorderSoft} group shadow-xl shadow-black/40 relative overflow-hidden`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          <div className={`p-4 rounded-2xl ${themeColor} text-white group-hover:bg-white group-hover:text-black transition-all transform group-hover:scale-110 shadow-lg`}>
            <Download className="w-8 h-8" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg">تثبيت التطبيق الآن</p>
            <p className="text-xs opacity-60 font-medium">استخدمه كأي تطبيق آخر على جهازك</p>
          </div>
        </button>
      ) : (
        <button 
          onClick={handleInstall}
          className={`flex items-center gap-1.5 px-3 py-1.5 ${themeBgSoft} ${themeText} rounded-lg font-bold text-xs hover:${themeColor} hover:text-white transition-all border ${themeBorderSoft} animate-pulse hover:animate-none`}
        >
          <Download className="w-4 h-4" />
          تحميل
        </button>
      )}

      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-lg">دليل التثبيت اليدوي</h3>
                <button onClick={() => setShowGuide(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                {isiOS ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">1</div>
                      <p className="text-sm text-zinc-300">اضغط على زر **المشاركة (Share)** في أسفل المتصفح.</p>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">2</div>
                      <p className="text-sm text-zinc-300">اسحب القائمة للأعلى واختر **"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)**.</p>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">3</div>
                      <p className="text-sm text-zinc-300">اضغط على **"إضافة" (Add)** في الزاوية العلوية.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">1</div>
                      <p className="text-sm text-zinc-300">اضغط على **النقاط الثلاث** في زاوية المتصفح.</p>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">2</div>
                      <p className="text-sm text-zinc-300">اختر **"تثبيت التطبيق" (Install App)** أو **"إضافة إلى الشاشة الرئيسية"**.</p>
                    </div>
                  </div>
                )}
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                  <p className="text-xs text-orange-500 leading-relaxed font-medium">
                    ملاحظة: هذا التطبيق هو "تطبيق ويب" (PWA)، لا يحتاج للتحميل من المتجر، بل يتم تثبيته مباشرة من المتصفح ليعمل كأي تطبيق آخر.
                  </p>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="w-full py-3 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-colors"
                >
                  فهمت، سأفعل ذلك
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const MessageReactions = ({ reactions, onReact }: { reactions?: Record<string, string[]>, onReact: (emoji: string) => void }) => {
  if (!reactions || Object.keys(reactions).length === 0) return null;
  const { user } = useAuth();

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {Object.entries(reactions).map(([emoji, users]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] transition-colors ${
            users.includes(user?.uid || '') 
              ? 'bg-white/20 text-white border border-white/30' 
              : 'bg-black/20 text-zinc-300 border border-transparent hover:bg-black/40'
          }`}
        >
          <span>{emoji}</span>
          {users.length > 1 && <span className="font-bold">{users.length}</span>}
        </button>
      ))}
    </div>
  );
};

const ReactionPicker = ({ onSelect }: { onSelect: (emoji: string) => void }) => {
  const emojis = ['❤️', '😂', '😮', '😢', '🔥', '👍'];
  return (
    <motion.div 
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex gap-1 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl"
    >
      {emojis.map(emoji => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="text-lg hover:scale-125 transition-transform p-1 leading-none"
        >
          {emoji}
        </button>
      ))}
    </motion.div>
  );
};

const ChatList = ({ onSelectChat, activeChatId }: { onSelectChat: (id: string) => void, activeChatId: string | null }) => {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [streaks, setStreaks] = useState<Record<string, number>>({});

  const theme = THEMES.find(t => t.id === profile?.theme) || THEMES[0];
  const themeColor = theme.color;
  const themeBorder = themeColor.replace('bg-', 'border-');
  const themeBgSoft = themeColor.replace('bg-', 'bg-') + '/10';

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
      setChats(chatList);

      // Fetch participant profiles
      chatList.forEach(chat => {
        const otherId = chat.participants.find(p => p !== user.uid);
        if (otherId && !profiles[otherId]) {
          onSnapshot(doc(db, 'users', otherId), (doc) => {
            if (doc.exists()) {
              setProfiles(prev => ({ ...prev, [otherId]: doc.data() as UserProfile }));
            }
          }, (err) => handleFirestoreError(err, OperationType.GET, `users/${otherId}`));
        }

        // Fetch streaks
        const streakId = [user.uid, otherId].sort().join('_');
        onSnapshot(doc(db, 'streaks', streakId), (doc) => {
          if (doc.exists()) {
            setStreaks(prev => ({ ...prev, [otherId!]: (doc.data() as Streak).count }));
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, `streaks/${streakId}`));
      });
    }, (err) => handleFirestoreError(err, OperationType.GET, 'chats'));
  }, [user]);

  return (
    <div className="divide-y divide-zinc-900">
      {chats.map(chat => {
        const otherId = chat.participants.find(p => p !== user?.uid);
        const otherProfile = otherId ? profiles[otherId] : null;
        const streakCount = otherId ? streaks[otherId] : 0;
        const isActive = activeChatId === chat.id;

        return (
          <button
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={`w-full p-4 flex items-center gap-4 hover:bg-zinc-900 transition-colors text-left ${isActive ? `${themeBgSoft} border-r-4 ${themeBorder}` : ''}`}
          >
            <UserAvatar photoURL={otherProfile?.photoURL} displayName={otherProfile?.displayName} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold truncate">{otherProfile?.displayName || 'جاري التحميل...'}</h3>
                {chat.lastMessageAt && (
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    {format(chat.lastMessageAt.toDate(), 'HH:mm', { locale: ar })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-zinc-500 truncate flex-1">{chat.lastMessage || 'لا توجد رسائل بعد'}</p>
                <StreakBadge count={streakCount} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

const ChatRoom = ({ 
  chatId, 
  onBack, 
  isSidebarCollapsed, 
  setIsSidebarCollapsed 
}: { 
  chatId: string, 
  onBack: () => void,
  isSidebarCollapsed: boolean,
  setIsSidebarCollapsed: (v: boolean) => void
}) => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const theme = THEMES.find(t => t.id === profile?.theme) || THEMES[0];
  const themeColor = theme.color;
  const themeHover = theme.hover;
  const themeText = themeColor.replace('bg-', 'text-');

  const bgStyle = profile?.chatBackground 
    ? (profile.chatBackground.startsWith('http') 
        ? { backgroundImage: `url(${profile.chatBackground})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { backgroundColor: profile.chatBackground })
    : {};

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const reactions = { ...(message.reactions || {}) };
    const users = reactions[emoji] || [];
    
    if (users.includes(user.uid)) {
      reactions[emoji] = users.filter(id => id !== user.uid);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, user.uid];
    }

    try {
      await updateDoc(messageRef, { reactions });
      setActiveReactionPicker(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  useEffect(() => {
    if (!chatId) return;
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }, (err) => handleFirestoreError(err, OperationType.GET, `chats/${chatId}/messages`));
  }, [chatId]);

  useEffect(() => {
    const fetchOther = async () => {
      try {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (chatSnap.exists()) {
          const participants = chatSnap.data().participants as string[];
          const otherId = participants.find(p => p !== user?.uid);
          if (otherId) {
            onSnapshot(doc(db, 'users', otherId), (doc) => {
              if (doc.exists()) setOtherProfile(doc.data() as UserProfile);
            }, (err) => handleFirestoreError(err, OperationType.GET, `users/${otherId}`));

            // Streak
            const streakId = [user?.uid, otherId].sort().join('_');
            onSnapshot(doc(db, 'streaks', streakId), (doc) => {
              if (doc.exists()) setStreak(doc.data() as Streak);
            }, (err) => handleFirestoreError(err, OperationType.GET, `streaks/${streakId}`));
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chats/${chatId}`);
      }
    };
    fetchOther();
  }, [chatId, user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;

    const msgText = text;
    setText('');

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: user.uid,
        text: msgText,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: msgText,
        lastMessageAt: serverTimestamp()
      });

      // Update Streak
      if (otherProfile) {
        const streakId = [user.uid, otherProfile.uid].sort().join('_');
        const streakRef = doc(db, 'streaks', streakId);
        const streakSnap = await getDoc(streakRef);

        if (!streakSnap.exists()) {
          await setDoc(streakRef, {
            user1: user.uid,
            user2: otherProfile.uid,
            count: 1,
            lastInteraction: serverTimestamp()
          });
        } else {
          const data = streakSnap.data() as Streak;
          const lastDate = data.lastInteraction.toDate();
          
          if (!isToday(lastDate)) {
            if (isYesterday(lastDate)) {
              await updateDoc(streakRef, {
                count: data.count + 1,
                lastInteraction: serverTimestamp()
              });
            } else {
              await updateDoc(streakRef, {
                count: 1,
                lastInteraction: serverTimestamp()
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Send error:', err);
    }
  };

  const startCall = async () => {
    if (!user || !otherProfile) return;
    try {
      const callRef = await addDoc(collection(db, 'calls'), {
        callerId: user.uid,
        receiverId: otherProfile.uid,
        status: 'ringing',
        createdAt: serverTimestamp()
      });
      // Further WebRTC logic would go here
    } catch (err) {
      console.error('Call error:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <header className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="hidden md:flex p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <Search className={`w-5 h-5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={onBack} className="md:hidden p-2 -ml-2 hover:bg-zinc-800 rounded-full">
            <X className="w-5 h-5" />
          </button>
          <UserAvatar photoURL={otherProfile?.photoURL} displayName={otherProfile?.displayName} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold leading-tight">{otherProfile?.displayName || 'جاري التحميل...'}</h3>
              <StreakBadge count={streak?.count || 0} />
            </div>
            <p className="text-xs text-zinc-500">نشط الآن</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowCallHistory(true)} 
            className="p-2.5 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white"
            title="سجل المكالمات"
          >
            <History className="w-5 h-5" />
          </button>
          <button onClick={startCall} className={`p-2.5 hover:bg-zinc-800 rounded-full transition-colors ${themeText}`}>
            <Video className="w-5 h-5" />
          </button>
          <button onClick={startCall} className={`p-2.5 hover:bg-zinc-800 rounded-full transition-colors ${themeText}`}>
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2.5 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showCallHistory && (
          <CallHistoryModal onClose={() => setShowCallHistory(false)} otherUid={otherProfile?.uid} />
        )}
      </AnimatePresence>

      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative"
        style={bgStyle}
      >
        {profile?.chatBackground && profile.chatBackground.startsWith('http') && (
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
        )}
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === user?.uid;
          const showTime = idx === 0 || differenceInDays(msg.createdAt?.toDate() || new Date(), messages[idx-1].createdAt?.toDate() || new Date()) > 0;

          return (
            <React.Fragment key={msg.id}>
              {showTime && msg.createdAt && (
                <div className="flex justify-center my-6">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-900/50 px-3 py-1 rounded-full">
                    {format(msg.createdAt.toDate(), 'MMMM d, yyyy', { locale: ar })}
                  </span>
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                {!isMe && (
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button 
                      onClick={() => setActiveReactionPicker(activeReactionPicker === msg.id ? null : msg.id)}
                      className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    {activeReactionPicker === msg.id && (
                      <div className="absolute left-0 bottom-full mb-2">
                        <ReactionPicker onSelect={(emoji) => handleReaction(msg.id, emoji)} />
                      </div>
                    )}
                  </div>
                )}
                
                {isMe && (
                  <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button 
                      onClick={() => setActiveReactionPicker(activeReactionPicker === msg.id ? null : msg.id)}
                      className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    {activeReactionPicker === msg.id && (
                      <div className="absolute right-0 bottom-full mb-2">
                        <ReactionPicker onSelect={(emoji) => handleReaction(msg.id, emoji)} />
                      </div>
                    )}
                  </div>
                )}

                <div className={`max-w-[80%] md:max-w-[70%] p-3 rounded-2xl relative z-10 ${isMe ? `${themeColor} text-white rounded-tr-none` : 'bg-zinc-900 text-zinc-200 rounded-tl-none'}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  <MessageReactions reactions={msg.reactions} onReact={(emoji) => handleReaction(msg.id, emoji)} />
                  <div className={`text-[9px] mt-1 font-bold opacity-60 ${isMe ? 'text-right' : 'text-left'}`}>
                    {msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm', { locale: ar }) : '...'}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-[#0a0a0a]">
        <div className="flex items-center gap-2 bg-zinc-900 rounded-2xl p-1 pl-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب رسالة..."
            className="flex-1 bg-transparent py-3 outline-none text-sm"
          />
          <button 
            type="submit"
            disabled={!text.trim()}
            className={`p-3 ${themeColor} text-white rounded-xl ${themeHover} transition-colors disabled:opacity-50 disabled:hover:${themeColor}`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

const UserSearch = ({ onClose, onSelectChat }: { onClose: () => void, onSelectChat: (id: string) => void }) => {
  const { user, profile } = useAuth();
  const [queryStr, setQueryStr] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const theme = THEMES.find(t => t.id === profile?.theme) || THEMES[0];
  const themeColor = theme.color;
  const themeBorder = themeColor.replace('bg-', 'border-');

  useEffect(() => {
    if (!queryStr.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    const q = query(
      collection(db, 'users'),
      where('searchKeywords', 'array-contains', queryStr.toLowerCase()),
      limit(10)
    );
    
    return onSnapshot(q, (snapshot) => {
      setResults(snapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(u => u.uid !== user?.uid && !u.isPrivate)
      );
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users (search)');
      setIsLoading(false);
    });
  }, [queryStr, user]);

  const handleSelect = async (otherUser: UserProfile) => {
    if (!user) return;
    const chatId = [user.uid, otherUser.uid].sort().join('_');
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        participants: [user.uid, otherUser.uid],
        lastMessage: '',
        lastMessageAt: serverTimestamp()
      });
    }
    onSelectChat(chatId);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-zinc-800"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-zinc-500" />
          <input
            autoFocus
            value={queryStr}
            onChange={(e) => setQueryStr(e.target.value)}
            placeholder="ابحث عن مستخدمين بالاسم..."
            className={`flex-1 bg-transparent outline-none py-2 focus:border-b ${themeBorder}`}
          />
          {isLoading && (
            <div className={`w-4 h-4 border-2 ${themeBorder} border-t-transparent rounded-full animate-spin`} />
          )}
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-2 custom-scrollbar">
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-zinc-500 gap-4">
              <div className={`w-8 h-8 border-4 ${themeBorder} border-t-transparent rounded-full animate-spin`} />
              <p className="text-sm">جاري البحث عن "{queryStr}"...</p>
            </div>
          ) : results.length > 0 ? (
            results.map(u => (
              <button
                key={u.uid}
                onClick={() => handleSelect(u)}
                className="w-full p-3 flex items-center gap-4 hover:bg-zinc-800 rounded-2xl transition-colors text-left"
              >
                <UserAvatar photoURL={u.photoURL} displayName={u.displayName} />
                <div>
                  <h4 className="font-bold">{u.displayName}</h4>
                  <p className="text-xs text-zinc-500">اضغط للدردشة</p>
                </div>
              </button>
            ))
          ) : (
            <div className="p-12 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-600">
                <Search className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-zinc-300">
                  {queryStr ? 'لم نجد أحداً بهذا الاسم' : 'ابدأ البحث الآن'}
                </h4>
                <p className="text-sm text-zinc-500 max-w-[200px]">
                  {queryStr 
                    ? `تأكد من كتابة الاسم بشكل صحيح أو جرب اسماً آخر.` 
                    : 'ابحث عن أصدقائك بالاسم للبدء في الدردشة معهم.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const CallOverlay = ({ call, onClose }: { call: Call, onClose: () => void }) => {
  const { user } = useAuth();
  const [otherPerson, setOtherPerson] = useState<UserProfile | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callStatus, setCallStatus] = useState(call.status);
  const [countdown, setCountdown] = useState(30);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const otherId = call.callerId === user?.uid ? call.receiverId : call.callerId;
    onSnapshot(doc(db, 'users', otherId), (doc) => {
      if (doc.exists()) setOtherPerson(doc.data() as UserProfile);
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${otherId}`));
    
    // Listen for call status updates
    return onSnapshot(doc(db, 'calls', call.id), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Call;
        setCallStatus(data.status);
        if (data.status === 'ended' || data.status === 'rejected') {
          onClose();
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `calls/${call.id}`));
  }, [call.callerId, call.id, onClose]);

  useEffect(() => {
    let interval: any;
    if (callStatus === 'ringing') {
      interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            handleAction(call.callerId === user?.uid ? 'ended' : 'rejected');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (callStatus === 'accepted') {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const handleAction = async (status: 'accepted' | 'rejected' | 'ended') => {
    await updateDoc(doc(db, 'calls', call.id), { status });
    if (status !== 'accepted') onClose();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-between p-8 md:p-12"
    >
      {/* Background/Video Placeholder */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-40">
        {otherPerson?.photoURL && (
          <img 
            src={otherPerson.photoURL} 
            className="w-full h-full object-cover blur-3xl scale-110" 
            alt="background" 
            referrerPolicy="no-referrer"
          />
        )}
      </div>

      {/* Caller Info */}
      <div className="relative z-10 flex flex-col items-center gap-6 mt-20">
        <div className="relative">
          <div className="absolute -inset-8 bg-orange-500/20 blur-3xl rounded-full animate-pulse" />
          <UserAvatar photoURL={otherPerson?.photoURL} displayName={otherPerson?.displayName} size="lg" />
          
          {/* Status Indicators */}
          <div className="absolute -bottom-2 -right-2 flex flex-col gap-2">
            <AnimatePresence>
              {isMuted && (
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="bg-red-500 p-2 rounded-full border-2 border-black shadow-lg"
                >
                  <MicOff className="w-4 h-4 text-white" />
                </motion.div>
              )}
              {isCameraOff && (
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="bg-zinc-800 p-2 rounded-full border-2 border-black shadow-lg"
                >
                  <VideoOff className="w-4 h-4 text-white" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-3xl font-bold mb-2">{otherPerson?.displayName}</h3>
          <div className="flex flex-col items-center gap-2">
            <p className="text-orange-500 font-bold tracking-widest uppercase text-xs animate-pulse">
              {callStatus === 'ringing' ? (call.callerId === user?.uid ? 'جاري الاتصال...' : 'مكالمة واردة...') : 'متصل'}
            </p>
            {callStatus === 'ringing' && (
              <span className="text-zinc-500 text-sm font-mono tracking-tighter">
                ينتهي في: {countdown} ثانية
              </span>
            )}
            {callStatus === 'accepted' && (
              <span className="text-white text-lg font-mono tracking-widest bg-zinc-900/50 px-4 py-1 rounded-full border border-zinc-800">
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="relative z-10 w-full max-w-md space-y-8 mb-12">
        {callStatus === 'accepted' && (
          <div className="grid grid-cols-3 gap-6">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className={`flex flex-col items-center gap-2 group`}
            >
              <div className={`p-5 rounded-full transition-all ${isMuted ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 group-hover:opacity-100 transition-opacity">
                {isMuted ? 'إلغاء الكتم' : 'كتم الصوت'}
              </span>
            </button>

            <button 
              onClick={() => setIsCameraOff(!isCameraOff)}
              className={`flex flex-col items-center gap-2 group`}
            >
              <div className={`p-5 rounded-full transition-all ${isCameraOff ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                {isCameraOff ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 group-hover:opacity-100 transition-opacity">
                {isCameraOff ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
              </span>
            </button>

            <button 
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className={`flex flex-col items-center gap-2 group`}
            >
              <div className={`p-5 rounded-full transition-all ${!isSpeakerOn ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 group-hover:opacity-100 transition-opacity">
                مكبر الصوت
              </span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-6">
          {callStatus === 'ringing' ? (
            call.callerId === user?.uid ? (
              <button 
                onClick={() => handleAction('ended')}
                className="w-full py-5 bg-red-500 text-white rounded-3xl hover:bg-red-600 transition-all flex items-center justify-center shadow-xl shadow-red-500/20"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
            ) : (
              <>
                <button 
                  onClick={() => handleAction('rejected')}
                  className="flex-1 py-5 bg-red-500 text-white rounded-3xl hover:bg-red-600 transition-all flex items-center justify-center shadow-xl shadow-red-500/20"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <button 
                  onClick={() => handleAction('accepted')}
                  className="flex-1 py-5 bg-green-500 text-white rounded-3xl hover:bg-green-600 transition-all flex items-center justify-center shadow-xl shadow-green-500/20"
                >
                  <VideoIcon className="w-7 h-7" />
                </button>
              </>
            )
          ) : (
            <button 
              onClick={() => handleAction('ended')}
              className="w-full py-5 bg-red-500 text-white rounded-3xl hover:bg-red-600 transition-all flex items-center justify-center shadow-xl shadow-red-500/20"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
