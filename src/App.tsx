import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Trash2, Save, Loader2, Plus, Minus, 
  Activity, AlertCircle, Scan, ChevronDown, Edit3, X as CloseIcon, 
  ImageIcon, ExternalLink, Layers, 
  ShoppingCart, RefreshCw, TrendingUp, TrendingDown, Moon, Sun,
  CameraIcon, Trophy, CheckCircle2, Scale, Cloud, Check, DollarSign, Info, RotateCw, Tag, ChevronRight, ShieldCheck, Banknote, Coins, Pencil, Bookmark, BookOpen, LogOut, Circle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { analyzeAsset, reevaluateAssetValue } from './services/geminiService';

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Utilities ---

const compressImage = (base64Str: string, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      if (ratio < 1) {
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      }
    };
  });
};

const rotateImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(90 * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      }
    };
  });
};

// --- Components ---

const ImageZone = ({ label, img, setImg, onRotate }: any) => (
  <div className={`aspect-[3/4] rounded-[2.5rem] border-4 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all duration-300 relative ${img ? 'border-indigo-500 bg-slate-900 shadow-2xl' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>
    {img ? (
      <>
        <img src={img} className="w-full h-full object-contain p-4" alt={label} />
        {/* Mobile controls (always visible) */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 md:hidden">
          <button onClick={onRotate} className="p-3 bg-indigo-600 text-white rounded-xl shadow-xl active:scale-95"><RotateCw className="w-4 h-4" /></button>
          <button onClick={() => setImg(null)} className="p-3 bg-red-500 text-white rounded-xl shadow-xl active:scale-95"><Trash2 className="w-4 h-4" /></button>
        </div>
        {/* Desktop controls (hover) */}
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 md:hover:opacity-100 transition-opacity hidden md:flex items-center justify-center gap-4">
          <button onClick={onRotate} className="p-4 bg-indigo-600 text-white rounded-full shadow-2xl transition-transform hover:scale-110 active:scale-95"><RotateCw className="w-6 h-6" /></button>
          <button onClick={() => setImg(null)} className="p-4 bg-red-500 text-white rounded-full shadow-2xl transition-transform hover:scale-110 active:scale-95"><Trash2 className="w-6 h-6" /></button>
        </div>
      </>
    ) : (
      <div className="text-center p-8 space-y-6">
        <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto border border-slate-700 shadow-xl"><Scan className="w-8 h-8 text-slate-500" /></div>
        <p className="text-[12px] font-black uppercase text-indigo-500 tracking-[0.2em]">{label}</p>
        <div className="flex gap-4">
          <label className="p-5 rounded-3xl bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xl transition-all hover:scale-105 active:scale-95">
            <CameraIcon className="w-6 h-6" />
            <input type="file" capture="environment" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setImg(r.result as string); r.readAsDataURL(f); } }} className="hidden" />
          </label>
          <label className="p-5 rounded-3xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer border border-slate-700 shadow-xl transition-all hover:scale-105 active:scale-95">
            <ImageIcon className="w-6 h-6" />
            <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setImg(r.result as string); r.readAsDataURL(f); } }} className="hidden" />
          </label>
        </div>
      </div>
    )}
  </div>
);

const App = () => {
  const [activeTab, setActiveTab] = useState('scanner');
  const [user, setUser] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [selectedCaseCard, setSelectedCaseCard] = useState<any>(null);
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [quotaCooldown, setQuotaCooldown] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<any>(null);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const scanCancelledRef = useRef(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;
    if (isAnalyzing) {
      setScanStartTime(Date.now());
      setScanProgress(0);
      scanCancelledRef.current = false;
      
      // Simulate progress over ~30s
      intervalId = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 98) return prev;
          const remaining = 100 - prev;
          return prev + (remaining * 0.04); 
        });
      }, 500);

      timeoutId = setTimeout(() => {
        if (!scanCancelledRef.current) {
          setIsAnalyzing(false);
          setError("Scan timed out (60s). Please try again or check your connection.");
        }
      }, 60000);
    } else {
      setScanStartTime(null);
      setScanProgress(0);
    }
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isAnalyzing]);

  useEffect(() => {
    if (quotaCooldown > 0) {
      const timer = setInterval(() => {
        setQuotaCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [quotaCooldown]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login Error:", err);
      setError(err.message || "Failed to sign in.");
    }
  };

  useEffect(() => {
    if (!user) return;
    const path = 'inventory';
    const cardsRef = collection(db, path);
    const q = query(cardsRef, where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCards(cardList.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
      setError("Failed to sync with cloud.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleAnalyzeAsset = async () => {
    if (!frontImage || !backImage) { setError("Capture both sides."); return; }
    setIsAnalyzing(true);
    scanCancelledRef.current = false;
    setError('');
    setScanProgress(5);
    
    try {
      const compFront = await compressImage(frontImage);
      const compBack = await compressImage(backImage);

      const parsed = await analyzeAsset(compFront, compBack);
      
      if (scanCancelledRef.current) return;
      
      parsed.isGraded = false;
      parsed.gradingCompany = parsed.isCoin ? "NGC" : (parsed.isCurrency ? "PMG" : (parsed.isStamp ? "ASG" : (parsed.isComic ? "CGC" : "BGS")));
      parsed.officialGrade = parsed.estimatedGrade;
      parsed.marketValue = parsed.marketValue || 0; 
      parsed.marketValueRaw = parsed.marketValueRaw || 0;
      parsed.marketValuePSA9 = parsed.marketValuePSA9 || 0;
      parsed.marketValuePSA10 = parsed.marketValuePSA10 || 0;
      
      setScanProgress(100);
      
      // Brief delay to show 100% completion
      setTimeout(() => {
        if (!scanCancelledRef.current) {
          setAnalysisResult(parsed);
          setActiveTab('scanner');
          setIsAnalyzing(false);
        }
      }, 800);

    } catch (err: any) { 
      if (!scanCancelledRef.current) {
        console.error("Analysis Error:", err);
        
        const errStr = String(err).toLowerCase() + (err?.message || '').toLowerCase() + JSON.stringify(err).toLowerCase();
        const isQuota = err?.status === 429 || 
                        err?.error?.code === 429 ||
                        err?.code === 429 ||
                        errStr.includes('429') ||
                        errStr.includes('quota') ||
                        errStr.includes('resource_exhausted');
        
        if (isQuota) {
          setError("GEMINI API QUOTA EXCEEDED: You've reached the scanning limit. Please wait 60 seconds.");
          setQuotaCooldown(60);
          setIsAnalyzing(false);
        } else {
          setError("Analysis failed. Please ensure the images are clear and try again."); 
          setIsAnalyzing(false);
        }
      }
    }
  };

  const handleRescanCaseCard = async (card: any) => {
    if (!card.frontImage || !card.backImage) return;
    setIsAnalyzing(true);
    setScanProgress(5);
    try {
      const parsed = await analyzeAsset(card.frontImage, card.backImage);
      const updates = {
        ...parsed,
        gradingCompany: parsed.isCoin ? "NGC" : (parsed.isCurrency ? "PMG" : (parsed.isStamp ? "ASG" : (parsed.isComic ? "CGC" : "BGS"))),
        officialGrade: parsed.estimatedGrade
      };
      setSelectedCaseCard({ ...card, ...updates });
      await updateCardDetails(card.id, updates);
      setScanProgress(100);
      setTimeout(() => setIsAnalyzing(false), 800);
    } catch (err: any) {
      console.error("Rescan Error:", err);
      const errStr = String(err).toLowerCase() + (err?.message || '').toLowerCase() + JSON.stringify(err).toLowerCase();
      const isQuota = err?.status === 429 || 
                      err?.error?.code === 429 ||
                      err?.code === 429 ||
                      errStr.includes('429') ||
                      errStr.includes('quota') ||
                      errStr.includes('resource_exhausted');

      if (isQuota) {
        setError("GEMINI API QUOTA EXCEEDED: Limit reached. Please wait 60 seconds.");
        setQuotaCooldown(60);
      } else {
        setError("Rescan failed. Please check your connection.");
      }
      setIsAnalyzing(false);
    }
  };

  const handleReevaluate = async (currentData: any) => {
    setIsReevaluating(true);
    try {
      const updatedValues = await reevaluateAssetValue(currentData);
      
      // Update local state for the appraisal view
      if (selectedCaseCard) {
        const updatedCard = { ...selectedCaseCard, ...updatedValues };
        setSelectedCaseCard(updatedCard);
        await updateCardDetails(selectedCaseCard.id, updatedValues);
      } else {
        setAnalysisResult((prev: any) => ({
          ...prev,
          ...updatedValues
        }));
      }
    } catch (err: any) {
      console.error("Re-evaluation Error:", err);
      const errStr = String(err).toLowerCase() + (err?.message || '').toLowerCase() + JSON.stringify(err).toLowerCase();
      const isQuota = err?.status === 429 || 
                      err?.error?.code === 429 ||
                      err?.code === 429 ||
                      errStr.includes('429') ||
                      errStr.includes('quota') ||
                      errStr.includes('resource_exhausted');

      if (isQuota) {
        setError("GEMINI API QUOTA EXCEEDED: Price check limit reached. Please wait 60 seconds.");
        setQuotaCooldown(60);
      } else {
        setError("Failed to re-evaluate asset value.");
      }
    } finally {
      setIsReevaluating(false);
    }
  };

  const saveToCase = async () => {
    if (!analysisResult || !user) return;
    setIsSaving(true);
    const path = 'inventory';
    try {
      const [f, b] = await Promise.all([
        compressImage(frontImage!, 600, 600, 0.6), 
        compressImage(backImage!, 600, 600, 0.6)
      ]);
      const cardId = crypto.randomUUID();
      const newCard = {
        ...analysisResult,
        frontImage: f,
        backImage: b,
        quantity: 1,
        cost: 0,
        createdAt: Date.now(),
        ownerId: user.uid
      };
      await setDoc(doc(db, path, cardId), newCard);
      setAnalysisResult(null); 
      setFrontImage(null); 
      setBackImage(null); 
      setActiveTab('case');
    } catch (err) { 
      handleFirestoreError(err, OperationType.CREATE, path);
      setError("Failed to save to cloud storage."); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const deleteCard = async (id: string) => {
    if (!user) return;
    const path = `inventory/${id}`;
    try {
      await deleteDoc(doc(db, 'inventory', id));
      setSelectedCaseCard(null); 
      setCardToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
      setError("Failed to delete card.");
    }
  };

  const updateFinancials = async (id: string, field: string, value: string) => {
    if (!user) return;
    const path = `inventory/${id}`;
    try {
      const cardRef = doc(db, 'inventory', id);
      await updateDoc(cardRef, { [field]: parseFloat(value) || 0 });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
      setError("Failed to update financial data.");
    }
  };

  const updateCardDetails = async (id: string, updates: any) => {
    if (!user) return;
    const path = `inventory/${id}`;
    try {
      const cardRef = doc(db, 'inventory', id);
      await updateDoc(cardRef, updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
      setError("Failed to update asset.");
    }
  };

  const formatDisplayValue = (val: number) => {
    const num = Number(val) || 0;
    if (num >= 10000) {
      return '$' + (num / 1000).toLocaleString(undefined, { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
      }) + 'k';
    }
    return '$' + num.toLocaleString();
  };

  const stats = useMemo(() => {
    const totalItems = cards.reduce((sum, c) => sum + (c.quantity || 1), 0);
    const totalMarket = cards.reduce((sum, c) => sum + ((c.marketValue || 0) * (c.quantity || 1)), 0);
    const totalCost = cards.reduce((sum, c) => sum + ((c.cost || 0) * (c.quantity || 1)), 0);
    const profitLoss = totalMarket - totalCost;
    return { 
      count: cards.length, 
      totalItems, 
      totalMarket, 
      totalCost, 
      profitLoss, 
      profitPct: totalCost > 0 ? (profitLoss / totalCost) * 100 : 0 
    };
  }, [cards]);

  const handleRotate = async (side: 'front' | 'back') => {
    if (side === 'front' && frontImage) {
      const rotated = await rotateImage(frontImage);
      setFrontImage(rotated);
    } else if (side === 'back' && backImage) {
      const rotated = await rotateImage(backImage);
      setBackImage(rotated);
    }
  };

  const filteredCards = cards.filter(c => 
    String(c.player || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(c.brand || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.05),transparent)]">
        <div className="max-w-md w-full space-y-12 text-center animate-in fade-in zoom-in duration-700">
          <div className="space-y-4">
            <h1 className="text-6xl font-black italic tracking-tighter uppercase leading-none">
              Ace Card <span className="text-indigo-500">Case</span>
            </h1>
            <p className="text-[12px] uppercase tracking-[0.6em] text-slate-500 font-bold opacity-80">Advanced Appraisal Intelligence</p>
          </div>
          
          <div className="bg-slate-900/50 p-12 rounded-[4rem] border border-slate-800 shadow-2xl space-y-8 backdrop-blur-xl">
            <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-indigo-600/30">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black italic uppercase tracking-tight text-white leading-none">Collector Access</h2>
              <p className="text-slate-500 text-sm font-medium">Synchronize your collection across devices with secure cloud storage.</p>
            </div>
            <button 
              onClick={handleLogin}
              className="w-full py-5 bg-white text-slate-950 rounded-[2rem] font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-all hover:scale-[1.02] active:scale-95 shadow-xl flex items-center justify-center gap-3"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              Sign in with Google
            </button>
            {error && <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden flex flex-col pt-8 md:pt-0">
      {/* Top Navigation Header */}
      <header className="flex flex-col md:flex-row items-center px-4 md:px-10 py-3 md:py-6 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-[100] animate-in slide-in-from-top duration-700 gap-4 md:gap-4 lg:gap-0">
        <div className="w-full md:flex-none lg:flex-1 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-black italic tracking-tighter uppercase leading-none whitespace-nowrap">
              Ace Card <span className="text-indigo-500">Case</span>
            </h1>
            <p className="text-[8px] md:text-[9px] uppercase tracking-[0.4em] text-slate-600 mt-1 font-bold">Appraisal System v3.2</p>
          </div>
          
          {/* User Info (Mobile Only - below md) */}
          <div className="flex md:hidden items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-xl p-1.5 px-3 max-w-[140px]">
             <div className="flex flex-col min-w-0">
               <p className="text-[9px] font-black italic uppercase leading-none truncate">{user?.email?.split('@')[0] || 'Collector'}</p>
             </div>
             <button 
               onClick={() => auth.signOut()}
               className="p-1 hover:bg-white/5 rounded-lg text-slate-500 hover:text-red-400 transition-colors ml-1 flex-shrink-0"
             >
               <LogOut className="w-3 h-3" />
             </button>
          </div>
        </div>

        <nav className="w-full md:w-auto flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 flex-none md:mx-0 lg:mx-4">
          <button 
            onClick={() => setActiveTab('scanner')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 md:gap-3 px-4 md:px-6 py-2.5 md:py-3 rounded-xl transition-all duration-300 ${activeTab === 'scanner' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            <Scan className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Scanner HUD</span>
          </button>
          <button 
            onClick={() => setActiveTab('case')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 md:gap-3 px-4 md:px-6 py-2.5 md:py-3 rounded-xl transition-all duration-300 ${activeTab === 'case' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            <Trophy className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">My Case</span>
          </button>
        </nav>

        <div className="hidden lg:flex lg:flex-1 items-center justify-center">
          <span className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400/60 transition-opacity">Asset Appraisal</span>
        </div>

        <div className="hidden md:flex md:flex-none lg:flex-1 justify-end">
          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-2 px-4 shadow-xl">
            <div className="min-w-0">
              <p className="text-[10px] font-black italic uppercase leading-none truncate max-w-[100px] lg:max-w-none">{user?.email?.split('@')[0] || 'Collector'}</p>
              <p className="hidden md:block text-[7px] text-indigo-400 font-black uppercase mt-1 tracking-widest whitespace-nowrap">Collector Pro</p>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="ml-1 p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Sub-Header Stats & Search line */}
      {activeTab === 'case' && (
        <div className="px-6 md:px-10 py-6 md:py-8 bg-slate-950/30 flex flex-col items-center gap-6 animate-in slide-in-from-top-4 duration-500">
          {/* Row 1: Cost and Gain */}
          <div className="flex gap-12 md:gap-32 justify-center items-center animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600 mb-1">Total Cost</span>
              <span className="text-xl md:text-2xl font-black italic tracking-tighter text-slate-400 font-mono">{formatDisplayValue(stats.totalCost)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-emerald-500/60 mb-1">Total Gain</span>
              <span className={`text-xl md:text-2xl font-black italic tracking-tighter font-mono ${stats.profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.profitLoss >= 0 ? '+' : '-'}{formatDisplayValue(Math.abs(stats.profitLoss))}
              </span>
            </div>
          </div>

          {/* Row 2: Portfolio Value (Centered) */}
          <div className="flex flex-col items-center bg-white/5 px-10 py-4 rounded-3xl border border-white/5 animate-in fade-in zoom-in duration-300 delay-75 shadow-xl">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-1">Portfolio Value</span>
            <span className="text-4xl md:text-5xl font-black italic tracking-tighter text-white font-mono">{formatDisplayValue(stats.totalMarket)}</span>
          </div>

          {/* Row 3: Search Bar */}
          <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-500 delay-150">
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl px-6 py-4 flex items-center gap-4 focus-within:border-indigo-500/50 focus-within:bg-slate-900 transition-all shadow-2xl">
              <Search className="w-5 h-5 text-indigo-500" />
              <input 
                type="text" 
                placeholder="SEARCH COLLECTION ASSETS..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="bg-transparent border-none outline-none text-xs font-black uppercase tracking-[0.2em] w-full text-slate-300 placeholder:text-slate-700" 
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scanner' && (
        <div className="px-6 md:px-10 py-2 bg-slate-950/30 animate-in slide-in-from-top-4 duration-500 invisible h-4">
          {/* Spacer for transition consistency */}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-6 md:p-10 gap-6 md:gap-10 overflow-hidden">

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between gap-4 group"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
              <button onClick={() => setError('')} className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors">
                <CloseIcon className="w-4 h-4" />
              </button>
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            {activeTab === 'scanner' ? (
              <motion.div 
                key="scanner"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                {!analysisResult ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto py-4 md:py-8">
                    <ImageZone label="Asset Front" img={frontImage} setImg={setFrontImage} onRotate={() => handleRotate('front')} />
                    <ImageZone label="Asset Back" img={backImage} setImg={setBackImage} onRotate={() => handleRotate('back')} />
                    
                    {isAnalyzing && (
                      <div className="md:col-span-2 space-y-4 max-w-2xl mx-auto w-full pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-end mb-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Analysis in Progress</span>
                            <span className="text-xl font-black italic uppercase text-white">Quantum Processing...</span>
                          </div>
                          <span className="text-2xl font-black italic text-indigo-500">{Math.round(scanProgress)}%</span>
                        </div>
                        <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-1 shadow-inner">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${scanProgress}%` }}
                            className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.5)]"
                          />
                        </div>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em] text-center pt-2">BGS AI Engine: Spectral Map Integration v3.2</p>
                      </div>
                    )}

                    <div className="md:col-span-2 text-center pt-8">
                      <button 
                        onClick={() => {
                          if (isAnalyzing) {
                            scanCancelledRef.current = true;
                            setIsAnalyzing(false);
                          } else {
                            handleAnalyzeAsset();
                          }
                        }} 
                        disabled={quotaCooldown > 0 || (!isAnalyzing && (!frontImage || !backImage))} 
                        className={`w-full md:w-auto px-16 py-6 border-none text-white rounded-[2.5rem] font-black uppercase italic tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-6 mx-auto group ${isAnalyzing ? 'bg-red-600 shadow-red-600/40' : quotaCooldown > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 shadow-indigo-600/40 hover:scale-105 active:scale-95 disabled:bg-slate-900 disabled:text-slate-700 disabled:border-slate-800'}`}
                      >
                        {isAnalyzing ? <CloseIcon className="w-8 h-8" /> : quotaCooldown > 0 ? <Loader2 className="w-8 h-8 animate-spin" /> : <Scan className="w-8 h-8 group-hover:rotate-90 transition-transform duration-500" />}
                        <span className="text-xl">
                          {isAnalyzing ? 'Discard Scan' : quotaCooldown > 0 ? `Retry in ${quotaCooldown}s` : 'Initialize Appraisal'}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <AppraisalDetailView 
                    data={analysisResult} 
                    setData={setAnalysisResult}
                    front={frontImage} back={backImage} 
                    onRotate={handleRotate}
                    onRescan={handleAnalyzeAsset}
                    onReevaluate={handleReevaluate}
                    isAnalyzing={isAnalyzing}
                    isReevaluating={isReevaluating}
                    scanProgress={scanProgress}
                    onCancel={() => {
                       setAnalysisResult(null);
                    }} 
                    onFullReset={() => {
                       setAnalysisResult(null); 
                       setFrontImage(null); 
                       setBackImage(null);
                    }}
                    onSave={saveToCase} 
                    isSaving={isSaving}
                    darkMode={true}
                    user={user}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="vault"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black uppercase italic tracking-widest text-slate-400">My Case <span className="text-slate-700 ml-4">{filteredCards.length} Assets</span></h3>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-40 opacity-40">
                    <Loader2 className="w-12 h-12 animate-spin mb-6 text-indigo-500" />
                    <p className="text-sm font-black uppercase tracking-[0.3em]">Synching with My Case...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {Array.from(new Map(filteredCards.map(c => [c.id, c])).values()).map((card: any, index) => (
                      <motion.div 
                        layout
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        key={card.id || `card-${index}`} 
                        className="group bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-600/10 transition-all duration-500 flex flex-col relative"
                      >
                        <div className="aspect-[3/4] relative overflow-hidden bg-slate-950 cursor-pointer" onClick={() => setSelectedCaseCard(card)}>
                          <img src={card.frontImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out p-1 rounded-[2.5rem]" alt="" />
                          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950 to-transparent opacity-60" />
                          
                          <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase italic shadow-2xl z-20">
                            <span className="text-indigo-400 mr-2">{card.gradingCompany || 'BGS'}</span>
                            <span className="text-white">{card.isGraded ? card.officialGrade : card.estimatedGrade}</span>
                          </div>

                          <div className="absolute bottom-4 inset-x-4 flex items-center gap-2 z-20">
                            <div className="flex-1 flex justify-center">
                              <div className="bg-slate-950/60 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase italic text-white shadow-2xl transition-opacity whitespace-nowrap">
                                Click to Edit
                              </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setCardToDelete(card); }} className="p-2.5 bg-red-600/90 backdrop-blur-md text-white border border-red-500/50 rounded-2xl shadow-xl hover:bg-red-700 transition-all active:scale-90 shrink-0"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <div className="p-5 space-y-4 flex-1 flex flex-col relative z-20">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-600 leading-none mb-1 tracking-widest">{card.year} {card.isStamp ? (card.brand || '').replace(/United States/gi, 'US').replace(/3\s*Cents?/gi, '3 Cent Stamp') : card.brand}</p>
                            <h3 className="text-sm font-black italic uppercase truncate leading-tight text-white mb-1">
                              {card.isStamp ? (card.player || '').replace(/United States/gi, 'US').replace(/3\s*Cents?/gi, '3 Cent Stamp') : card.player}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">{card.variant === 'Base' ? 'Standard' : card.variant}</span>
                              {card.isCoin && <Coins className="w-2.5 h-2.5 text-indigo-400" />}
                              {card.isCurrency && <Banknote className="w-2.5 h-2.5 text-indigo-400" />}
                              {card.isStamp && <Bookmark className="w-2.5 h-2.5 text-indigo-400" />}
                              {card.isComic && <BookOpen className="w-2.5 h-2.5 text-indigo-400" />}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 pt-2 mt-auto">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black uppercase text-slate-600 mb-1">Mkt Value</span>
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-black italic tracking-tighter">{formatDisplayValue(card.marketValue || 0)}</span>
                              </div>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[8px] font-black uppercase text-slate-600 mb-1">Gain/Loss</span>
                              <span className={`text-[10px] font-black italic px-2 py-0.5 rounded-lg inline-block self-end ${((card.marketValue || 0) - (card.cost || 0)) >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                {(((card.marketValue || 0) - (card.cost || 0)) >= 0 ? '+' : '-') + Math.abs((((card.marketValue || 0) - (card.cost || 0)) / (card.cost || 1)) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {filteredCards.length === 0 && !loading && (
                      <div className="col-span-full py-40 text-center opacity-30 grayscale">
                         <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Layers className="w-10 h-10 text-slate-700" />
                         </div>
                        <p className="text-lg font-black uppercase italic tracking-[0.4em]">Vault Isolated</p>
                        <p className="text-xs font-bold uppercase mt-2">No encrypted assets found matching query</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Overlays */}
      <AnimatePresence>
        {cardToDelete && (
          <motion.div 
            key="modal-delete"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-sm rounded-[3rem] p-10 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border border-slate-800 bg-slate-900 text-center relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-red-600" />
              <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-500/20"><AlertCircle className="w-10 h-10 text-red-500" /></div>
              <h3 className="text-2xl font-black uppercase italic mb-3 tracking-tighter">Delete Asset?</h3>
              <p className="text-[12px] font-bold text-slate-500 mb-10 uppercase tracking-widest leading-relaxed px-4">Permanent removal from secured global inventory. This cannot be reversed.</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setCardToDelete(null)} className="py-5 rounded-2xl font-black uppercase text-[11px] bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">Abort</button>
                <button onClick={() => deleteCard(cardToDelete.id)} className="py-5 rounded-2xl bg-red-600 text-white font-black uppercase text-[11px] shadow-2xl shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedCaseCard && (
          <motion.div 
            key="modal-detail"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-2 md:p-8"
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-6xl max-h-[95vh] rounded-[3rem] shadow-[0_50px_150px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative bg-slate-900 border border-slate-800"
            >
              <button onClick={() => setSelectedCaseCard(null)} className="absolute top-8 right-8 z-[260] w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-800/80 backdrop-blur-md text-slate-300 border border-slate-700 shadow-xl transition-all hover:scale-110 active:scale-90"><CloseIcon className="w-6 h-6" /></button>
              <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
                <AppraisalDetailView 
                  data={selectedCaseCard} 
                  setData={(updates: any) => {
                    const resolved = typeof updates === 'function' ? updates(selectedCaseCard) : updates;
                    setSelectedCaseCard({ ...selectedCaseCard, ...resolved });
                    updateCardDetails(selectedCaseCard.id, resolved);
                  }}
                  front={selectedCaseCard.frontImage} back={selectedCaseCard.backImage} 
                  onRotate={async (side: 'front' | 'back') => {
                    const currentImg = side === 'front' ? selectedCaseCard.frontImage : selectedCaseCard.backImage;
                    const rotated = await rotateImage(currentImg);
                    const updates = side === 'front' ? { frontImage: rotated } : { backImage: rotated };
                    setSelectedCaseCard({ ...selectedCaseCard, ...updates });
                    updateCardDetails(selectedCaseCard.id, updates);
                  }}
                  mode="case" 
                  onRescan={() => handleRescanCaseCard(selectedCaseCard)}
                  onReevaluate={handleReevaluate}
                  isAnalyzing={isAnalyzing}
                  isReevaluating={isReevaluating}
                  scanProgress={scanProgress}
                  onCancel={() => setSelectedCaseCard(null)} 
                  onDelete={() => setCardToDelete(selectedCaseCard)} 
                  darkMode={true} 
                  user={user}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AppraisalDetailView = ({ data, setData, front, back, onRotate, mode = 'scanner', onCancel, onFullReset, onSave, onDelete, onRescan, onReevaluate, isSaving, isAnalyzing, isReevaluating, scanProgress, darkMode, user }: any) => {
  const formatDisplayValue = (val: number) => {
    const num = Number(val) || 0;
    if (num >= 10000) {
      return '$' + (num / 1000).toLocaleString(undefined, { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
      }) + 'k';
    }
    return '$' + num.toLocaleString();
  };

  const [showParallelPicker, setShowParallelPicker] = useState(false);
  const [isManualParallel, setIsManualParallel] = useState(false);
  const [manualParallelValue, setManualParallelValue] = useState("");
  
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [isManualCompany, setIsManualCompany] = useState(false);
  const [manualCompanyValue, setManualCompanyValue] = useState("");

  const [showGradePicker, setShowGradePicker] = useState(false);
  const [isManualGrade, setIsManualGrade] = useState(false);
  const [manualGradeValue, setManualGradeValue] = useState("");
  
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [statusStep, setStatusStep] = useState<'base' | 'company' | 'grade'>('base');

  const gemProb = Number(data.gemMintProbability) || 0;
  
  const cardCompanies = ["BGS", "PSA", "SGC", "TAG", "CGC"];
  const coinCompanies = ["NGC", "PCGS", "ANACS", "ICG"];
  const paperCompanies = ["PMG", "PCGS", "Legacy"];
  const stampCompanies = ["ASG", "PSE", "PF", "PSAG"];
  const comicCompanies = ["CGC", "CBCS", "PGX"];
  
  const companies = data.isCoin ? coinCompanies : (data.isCurrency ? paperCompanies : (data.isStamp ? stampCompanies : (data.isComic ? comicCompanies : cardCompanies)));
  
  const sportGrades = ["BLK LABEL 10", "PRISTINE 10", "GEM MT 10", "GEM MT 9.5", "MT 9", "NM/MT 8.5", "NM/MT 8", "NM+ 7.5", "NM 7", "EX/NM 6.5", "EX MT 6", "EX+ 5.5", "EX 5", "VG/EX 4.5", "VG/EX 4", "VG+ 3.5", "VG 3", "GOOD+ 2.5", "GOOD 2", "FAIR 1.5", "POOR 1"];
  const numismaticGrades = ["70", "69", "68", "67", "66", "65", "64", "63", "62", "61", "60", "58", "55", "53", "50", "45", "40", "35", "30", "25", "20", "15", "12", "10", "8", "6", "4"];
  const stampGrades = ["Gem 100", "Superb 99", "XF/Superb 95", "XF 90", "VF/XF 88", "VF/XF 85", "VF 80", "F/VF 75", "F 70", "VG/F 60", "VG 50", "G/VG 40", "G 30", "Fair/G 20", "Fair 10"];
  const comicGrades = [
    "Gem Mint 10.0", "Mint 9.9", "NM/M 9.8", "NM+ 9.6", "NM 9.4", "NM- 9.2", 
    "VF/NM 9.0", "VF+ 8.5", "VF 8.0", "VF- 7.5", "FN/VF 7.0", "FN+ 6.5", 
    "FN 6.0", "FN- 5.5", "VG/FN 5.0", "VG+ 4.5", "VG 4.0", "VG- 3.5", 
    "G/VG 3.0", "G+ 2.5", "G 2.0", "G- 1.8", "Fa/G 1.5", "Fa 1.0", "Poor 0.5"
  ];
  
  const grades = data.isStamp ? stampGrades : (data.isComic ? comicGrades : ((data.isCoin || data.isCurrency) ? numismaticGrades : sportGrades));
  const coinPrefixes = ["MS", "PF", "SP"];

  const getEbayUrl = (type: 'sold' | 'active') => {
    let queryParts = [];
    if (data.isCoin || data.isCurrency) {
      // Coins and paper money: asset (player), year, mint mark (brand), variation (variant)
      queryParts = [data.player, data.year, data.brand, data.variant];
    } else if (data.isStamp) {
      // Stamps: year, name of the stamp (player), variation (variant), and always include "stamp"
      queryParts = [data.year, data.player, data.variant, 'stamp'];
    } else if (data.isComic) {
      // Comics: asset, year, variation
      queryParts = [data.player, data.year, data.variant];
    } else {
      // Sports/TCG Cards: asset (player), year, card number, parallel (variation)
      const parallelText = (data.variant && data.variant !== 'Base') ? data.variant : "";
      queryParts = [data.player, data.year, data.cardNumber, parallelText];
    }
    
    const cleanedQueryParts = queryParts.map(part => {
      if (!part) return "";
      // Explicitly remove parentheses as requested for an accurate search
      // Also remove "used" as requested
      return String(part).replace(/[()]/g, "").replace(/\bused\b/gi, "").trim();
    }).filter(Boolean);

    const queryStr = encodeURIComponent(cleanedQueryParts.join(' ').trim());
    
    if (type === 'sold') return `https://www.ebay.com/sch/i.html?_from=R40&_nkw=${queryStr}&_sacat=0&LH_Sold=1&LH_Complete=1&LH_BIN=1&_sop=13`;
    if (type === 'active') return `https://www.ebay.com/sch/i.html?_from=R40&_nkw=${queryStr}&_sacat=0&LH_BIN=1&_sop=15`;
    return '';
  };

  const getSubgradeIconColor = () => darkMode ? 'border-indigo-500/30 text-white bg-indigo-500/10' : 'border-indigo-500/20 text-indigo-600 bg-white';
  const parallels = Array.from(new Set((data.suggestedParallels || ["Base", "Holo", "Reverse Holo", "1st Edition"]).map((p: any) => String(p))));

  const handleSelectParallel = (v: string) => {
    if (v === 'MANUAL_ENTRY') {
      setIsManualParallel(true);
      setManualParallelValue(data.variant || "");
    } else {
      setData({ ...data, variant: v });
      setIsManualParallel(false);
    }
    setShowParallelPicker(false);
  };

  const handleSaveManualParallel = () => {
    setData({ ...data, variant: manualParallelValue });
    setIsManualParallel(false);
  };

  const handleSelectCompany = (c: string) => {
    if (c === 'MANUAL_ENTRY') {
      setIsManualCompany(true);
      setManualCompanyValue(data.gradingCompany || "");
    } else {
      setData({ ...data, gradingCompany: c });
      setIsManualCompany(false);
    }
    setShowCompanyPicker(false);
  };

  const handleSaveManualCompany = () => {
    setData({ ...data, gradingCompany: manualCompanyValue });
    setIsManualCompany(false);
  };

  const handleSelectGrade = (g: string) => {
    if (g === 'MANUAL_ENTRY') {
      setIsManualGrade(true);
      setManualGradeValue(data.officialGrade || "");
    } else {
      if (data.isCoin) {
        const currentPrefix = (data.officialGrade || "").split(" ")[0];
        const finalPrefix = coinPrefixes.includes(currentPrefix) ? currentPrefix : "MS";
        setData({ ...data, officialGrade: `${finalPrefix} ${g}` });
      } else {
        setData({ ...data, officialGrade: g });
      }
      setIsManualGrade(false);
    }
    setShowGradePicker(false);
  };

  const handleSaveManualGrade = () => {
    setData({ ...data, officialGrade: manualGradeValue });
    setIsManualGrade(false);
  };

  return (
    <div className="animate-in slide-in-from-bottom-6 duration-700 space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner - Sophisticated Dark Hero */}
      <div className="rounded-[3.5rem] overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-slate-800 bg-slate-900 group relative">
        {isAnalyzing && (
           <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-8 text-center animate-in fade-in duration-300">
              <RotateCw className="w-16 h-16 text-indigo-400 animate-spin mb-6" />
              <h3 className="text-4xl font-black italic uppercase text-white mb-2">Analyzing Asset...</h3>
              <p className="text-indigo-300 text-xs font-black uppercase tracking-[0.3em] mb-8">Quantum AI Scan v4.0</p>
              <div className="w-full max-w-md h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <motion.div 
                   className="h-full bg-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.6)]"
                   initial={{ width: 0 }}
                   animate={{ width: `${scanProgress}%` }}
                />
              </div>
              <span className="text-indigo-400 text-xl font-black italic mt-4">{Math.round(scanProgress)}%</span>
           </div>
        )}
        <div className="p-8 md:p-12 lg:p-16 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-white/5 rounded-full -mr-60 -mt-60 animate-pulse transition-transform group-hover:scale-105 duration-[5s]" />
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="space-y-4 text-center md:text-left flex-1 w-full">
              <h2 className={`${data.player?.length > 25 ? 'text-xl md:text-2xl lg:text-4xl' : 'text-2xl md:text-4xl lg:text-6xl'} font-black italic uppercase tracking-tighter leading-tight break-words md:whitespace-nowrap flex flex-col`}>
                <span className={data.player?.length > 25 ? 'whitespace-nowrap' : ''}>{data.isStamp ? (data.player || '').replace(/United States/gi, 'US').replace(/3\s*Cents?/gi, '3 Cent Stamp') : data.player}</span>
                {data.cardNumber && data.player?.length > 25 && (
                  <span className="text-indigo-400 text-base md:text-xl lg:text-2xl mt-1 font-black opacity-90">#{data.cardNumber}</span>
                )}
              </h2>
              <div className="flex items-center justify-center md:justify-start">
                <span className="text-white text-xs md:text-lg font-black italic uppercase tracking-widest bg-white/10 px-4 py-2 rounded-2xl border border-white/20 whitespace-nowrap inline-flex items-center gap-3">
                  {data.year} {data.isStamp ? (data.brand || '').replace(/United States/gi, 'US').replace(/3\s*Cents?/gi, '3 Cent Stamp') : data.brand} {data.cardNumber && data.player?.length <= 25 && <span className="text-white/60 text-[10px] md:text-sm">#{data.cardNumber}</span>}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-4">
                <div className="relative">
                  {isManualParallel ? (
                    <div className="flex items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 backdrop-blur-md">
                      <input 
                        type="text" autoFocus value={manualParallelValue}
                        onChange={(e) => setManualParallelValue(e.target.value)}
                        className="bg-transparent text-xs font-black uppercase tracking-widest outline-none px-3 w-32 placeholder:text-indigo-300/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveManualParallel();
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      <button onClick={handleSaveManualParallel} className="p-2.5 bg-indigo-500 rounded-xl hover:bg-emerald-500 transition-colors shadow-lg"><Check className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setShowParallelPicker(!showParallelPicker)} className="flex items-center gap-4 px-6 py-3.5 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/20 transition-all group backdrop-blur-md">
                      <Layers className="w-4 h-4 text-indigo-300" />
                      <div className="text-left">
                        <p className="text-[8px] font-black uppercase text-indigo-300 mb-0.5 opacity-70">VARIATION</p>
                        <p className="text-xs font-black uppercase tracking-wider">{data.variant || 'Standard'}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showParallelPicker ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {showParallelPicker && (
                    <div className="absolute top-full left-0 mt-3 w-72 z-[100] rounded-[2rem] border border-slate-700 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-4 overflow-hidden">
                      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {parallels.map((p: string) => (
                          <button key={`parallel-${p}`} onClick={() => handleSelectParallel(p)} className={`w-full text-left px-5 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${data.variant === p ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>{p}</button>
                        ))}
                        <div className="h-px bg-slate-800 my-3" />
                        <button key="btn-manual-parallel" onClick={() => handleSelectParallel('MANUAL_ENTRY')} className="w-full text-left px-5 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                          <Pencil className="w-3.5 h-3.5" /> Manual Entry
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button onClick={() => { setShowStatusMenu(!showStatusMenu); setStatusStep('base'); }} className={`flex items-center gap-4 px-6 py-3.5 rounded-2xl border transition-all ${data.isGraded ? 'bg-white text-indigo-600 border-white shadow-2xl shadow-white/20 scale-105' : 'bg-white/10 text-white border-white/20'}`}>
                    <ShieldCheck className={`w-5 h-5 ${data.isGraded ? 'text-indigo-600' : 'text-indigo-300'}`} />
                    <div className="text-left">
                      <p className={`text-[8px] font-black uppercase mb-0.5 ${data.isGraded ? 'text-indigo-400' : 'text-indigo-300'}`}>STATUS</p>
                      <p className="text-xs font-black uppercase tracking-wider">{data.isGraded ? 'Official' : 'Raw'}</p>
                    </div>
                    {(data.isGraded && data.gradingCompany) && (
                      <div className="ml-2 pl-4 border-l border-indigo-500/20 text-left">
                         <p className="text-[8px] font-black uppercase text-indigo-400 mb-0.5 opacity-70">{data.gradingCompany}</p>
                         <p className="text-xs font-black uppercase text-indigo-600">{data.officialGrade || '-'}</p>
                      </div>
                    )}
                    <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showStatusMenu && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
                      <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        onClick={() => setShowStatusMenu(false)}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                      />
                      <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-[3rem] shadow-2xl p-8 overflow-hidden"
                      >
                         <AnimatePresence mode="wait">
                            {statusStep === 'base' && (
                              <motion.div 
                                key="base" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }}
                                className="space-y-4"
                              >
                                 <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mb-6 text-center">Select Asset Status</p>
                                 <button 
                                   onClick={() => { setData({ ...data, isGraded: false }); setShowStatusMenu(false); }}
                                   className="w-full text-left px-6 py-5 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-between group transition-all border border-transparent hover:border-slate-700"
                                 >
                                   <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                                         <Circle className="w-4 h-4 text-slate-500" />
                                      </div>
                                      <span>Raw / Unauthenticated</span>
                                   </div>
                                   {!data.isGraded && <Check className="w-5 h-5 text-emerald-500" />}
                                 </button>
                                 <button 
                                   onClick={() => setStatusStep('company')}
                                   className="w-full text-left px-6 py-5 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-between group transition-all border border-transparent hover:border-slate-700"
                                 >
                                   <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                         <ShieldCheck className="w-4 h-4 text-indigo-400" />
                                      </div>
                                      <span>Official / Graded</span>
                                   </div>
                                   <ChevronRight className="w-5 h-5 text-indigo-500 group-hover:translate-x-1 transition-transform" />
                                 </button>
                              </motion.div>
                            )}

                            {statusStep === 'company' && (
                              <motion.div 
                                key="company" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                                className="space-y-4"
                              >
                                 <div className="flex items-center gap-2 mb-6">
                                    <button onClick={() => setStatusStep('base')} className="p-3 hover:bg-white/5 rounded-xl text-slate-500">
                                       <ChevronRight className="w-5 h-5 rotate-180" />
                                    </button>
                                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] flex-1 text-center">Grading Company</p>
                                 </div>
                                 
                                 {isManualCompany ? (
                                   <div className="space-y-4 p-4 bg-slate-950 rounded-2xl border border-indigo-500/10">
                                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Enter Grading Company</p>
                                      <div className="flex gap-2">
                                        <input 
                                           autoFocus
                                           value={manualCompanyValue}
                                           onChange={(e) => setManualCompanyValue(e.target.value.toUpperCase())}
                                           placeholder="..."
                                           className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-black uppercase text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                        />
                                        <button 
                                           onClick={() => {
                                              if (manualCompanyValue) {
                                                setData({ ...data, gradingCompany: manualCompanyValue, isGraded: true });
                                                setStatusStep('grade');
                                                setIsManualCompany(false);
                                              }
                                           }}
                                           className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl shadow-lg transition-all"
                                        >
                                           <Check className="w-5 h-5" />
                                        </button>
                                      </div>
                                      <button 
                                        onClick={() => setIsManualCompany(false)}
                                        className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                                      >
                                        Back to List
                                      </button>
                                   </div>
                                 ) : (
                                   <div className="grid grid-cols-2 gap-3">
                                      {companies.map(c => (
                                        <button 
                                          key={`company-${c}`}
                                          onClick={() => { 
                                            setData({ ...data, gradingCompany: c, isGraded: true }); 
                                            setStatusStep('grade'); 
                                          }}
                                          className={`px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${data.gradingCompany === c ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800'}`}
                                        >
                                          {c}
                                        </button>
                                      ))}
                                      <button 
                                        key="btn-manual-company"
                                        onClick={() => setIsManualCompany(true)}
                                        className="col-span-2 flex items-center justify-center gap-3 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 transition-all border border-indigo-500/20"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Manual Entry
                                      </button>
                                   </div>
                                 )}
                              </motion.div>
                            )}

                            {statusStep === 'grade' && (
                              <motion.div 
                                key="grade" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                                className="space-y-4"
                              >
                                 <div className="flex items-center gap-2 mb-6">
                                    <button onClick={() => setStatusStep('company')} className="p-3 hover:bg-white/5 rounded-xl text-slate-500">
                                       <ChevronRight className="w-5 h-5 rotate-180" />
                                    </button>
                                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] flex-1 text-center">Numerical Grade</p>
                                 </div>
                                 <div className="max-h-80 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                                    {grades.map(g => (
                                      <button 
                                        key={`grade-${g}`}
                                        onClick={() => { 
                                          handleSelectGrade(g);
                                          setShowStatusMenu(false);
                                        }}
                                        className={`w-full text-left px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${data.officialGrade === g ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800'}`}
                                      >
                                        {g}
                                      </button>
                                    ))}
                                 </div>
                              </motion.div>
                            )}
                         </AnimatePresence>
                      </motion.div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-6 h-full justify-center">
              <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white mb-2">{data.isGraded ? 'Official Grade' : 'Final Prediction'}</p>
                    <div className="flex flex-col items-center justify-center">
                       {(() => {
                         const gradeStr = data.isGraded ? (data.officialGrade || data.estimatedGrade || '??') : (data.estimatedGrade || '??');
                     const isCard = (!data.isComic && !data.isCoin && !data.isCurrency && !data.isStamp);
                     const parts = gradeStr.split(' ');
                     
                     return (
                       <div className="flex flex-col items-center">
                         {isCard && parts.length > 1 ? (
                            <div className="flex flex-col items-center gap-1">
                               <span className="text-3xl md:text-5xl font-black italic text-white uppercase tracking-tighter leading-none whitespace-nowrap drop-shadow-2xl">
                                  {parts.slice(0, -1).join(' ')}
                               </span>
                               <span className="text-6xl md:text-9xl font-black italic text-white uppercase tracking-tighter leading-none whitespace-nowrap drop-shadow-[0_10px_20px_rgba(255,255,255,0.2)]">
                                  {parts[parts.length - 1]}
                               </span>
                            </div>
                         ) : (
                           <div className="flex flex-row items-baseline gap-2 md:gap-3">
                             {parts.map((part, idx) => (
                               <span 
                                 key={`part-${idx}`} 
                                 className="text-6xl md:text-8xl font-black italic text-white uppercase tracking-tighter leading-none whitespace-nowrap drop-shadow-2xl"
                               >
                                 {part}
                               </span>
                             ))}
                           </div>
                         )}

                         {/* Autograph Grade Display */}
                         {isCard && data.autographGrade && !['null', 'NULL', 'None', 'N/A', 'none', 'n/a'].includes(String(data.autographGrade).trim()) && (
                           <div className="mt-4 px-4 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col items-center">
                             <p className="text-[8px] font-black uppercase text-amber-500 tracking-[0.2em] mb-1">AUTO GRADE</p>
                             <span className="text-3xl font-black italic text-white uppercase tracking-tighter leading-none drop-shadow-2xl">
                               {data.autographGrade}
                             </span>
                           </div>
                         )}
                       </div>
                     );
                   })()}
                </div>
                <button 
                  onClick={onRescan || onCancel}
                  disabled={isAnalyzing}
                  className="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-all flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  {isAnalyzing ? 'Scanning...' : 'Rescan Asset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        {/* Scan Visuals - Side by Side */}
        <div className="grid grid-cols-2 gap-3 md:gap-8 max-w-4xl mx-auto">
          <div className="group relative rounded-[3.5rem] overflow-hidden border-2 border-indigo-500/30 bg-slate-900 shadow-2xl aspect-[3/4] flex items-center justify-center transition-all duration-500 hover:border-indigo-500/60">
             <img src={front} className="w-full h-full object-contain p-4 md:p-12 transform transition-transform duration-700 group-hover:scale-105" alt="Front" />
             <div className="absolute top-6 left-6 md:top-10 md:left-10 p-2 md:p-5 bg-slate-950/80 backdrop-blur-md rounded-2xl md:rounded-[2rem] border border-slate-800">
                <Activity className="w-4 h-4 md:w-6 md:h-6 text-indigo-500" />
             </div>
          </div>
          <div className="group relative rounded-[3.5rem] overflow-hidden border-2 border-indigo-500/30 bg-slate-900 shadow-2xl aspect-[3/4] flex items-center justify-center transition-all duration-500 hover:border-indigo-500/60">
             <img src={back} className="w-full h-full object-contain p-4 md:p-12 transform transition-transform duration-700 group-hover:scale-105" alt="Back" />
          </div>
        </div>

        {/* Appraisal Diagnostics */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-[3.5rem] p-10 shadow-2xl relative overflow-hidden backdrop-blur-xl">
           <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full" />
           
           <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                    <Scale className="w-6 h-6 text-indigo-400" />
                 </div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter">Grade Diagnostics</h3>
              </div>
              <span className="px-4 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-widest border border-emerald-500/20 animate-pulse">Active Scan</span>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {Object.entries(data.subgrades || {}).map(([key, sub]: [string, any]) => (
                 <div key={`subgrade-${key}`} className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl shadow-[0_0_15px_rgba(79,70,229,0.1)] group hover:border-indigo-500/50 transition-all overflow-hidden flex flex-col">
                    <div className="px-5 py-4 flex items-center justify-between border-b border-indigo-500/10 bg-indigo-500/5">
                      <p className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] flex items-center gap-2">
                         <span className="w-1 h-3 bg-indigo-500 rounded-full" />
                         {key}
                      </p>
                      <div className="bg-indigo-600 text-white px-4 py-1 rounded-full border border-indigo-400/30 shadow-lg shadow-indigo-500/20">
                        <span className="text-xl font-black italic leading-none">{Number(sub.score) || 0}</span>
                      </div>
                    </div>
                    <div className="p-5">
                       <p className="text-[12px] font-medium text-slate-200 leading-relaxed uppercase">{sub.explanation}</p>
                    </div>
                 </div>
               ))}
               
               {!data.subgrades && (
                 <div className="p-8 bg-slate-950 border border-slate-800 rounded-[2rem] md:col-span-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Diagnostic Confidence</p>
                    <div className="space-y-4">
                      <div>
                         <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3 flex justify-between">
                            Pristine Probability <span className="text-white">{Math.min(Number((gemProb * 100).toFixed(0)), 99)}%</span>
                         </p>
                         <div className="w-full h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(gemProb, 0.99) * 100}%` }} className="h-full bg-indigo-500" />
                         </div>
                      </div>
                    </div>
                 </div>
               )}
            </div>

           <div className="mt-12 py-12 px-0 bg-indigo-950/20 border border-indigo-500/10 rounded-[3rem]">
              <div className="flex flex-col items-center text-center gap-6 mb-8 px-6">
                  <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                     <svg className="w-full h-full transform -rotate-90">
                        <circle
                           cx="64"
                           cy="64"
                           r="58"
                           stroke="currentColor"
                           strokeWidth="4"
                           fill="transparent"
                           className="text-slate-800"
                        />
                        <motion.circle
                           cx="64"
                           cy="64"
                           r="58"
                           stroke="currentColor"
                           strokeWidth="8"
                           fill="transparent"
                           strokeDasharray={2 * Math.PI * 58}
                           initial={{ strokeDashoffset: 2 * Math.PI * 58 }}
                           animate={{ strokeDashoffset: 2 * Math.PI * 58 * (1 - Math.min(gemProb, 0.99)) }}
                           className="text-indigo-500"
                           strokeLinecap="round"
                           transition={{ duration: 1.5, ease: "easeOut" }}
                        />
                     </svg>
                     <span className="absolute text-4xl font-black italic text-white drop-shadow-xl">
                        {Math.min(Number((gemProb * 100).toFixed(0)), 99)}%
                     </span>
                  </div>
                 <div className="flex flex-col items-center gap-1">
                    <p className="text-3xl font-black italic text-white uppercase tracking-tighter leading-none">GEM MINT Projection</p>
                    <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.4em] mt-2">AI Analytical Profile</p>
                 </div>
              </div>
              <div className="px-2">
                <div className="bg-indigo-500/5 border-y border-indigo-500/10 py-6 px-2">
                  <p className="text-sm font-medium text-slate-300 leading-relaxed uppercase tracking-wide text-center">{data.reasoning}</p>
                </div>
              </div>
           </div>
        </div>


        {/* Financial Records */}
        <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 space-y-8">
           <h3 className="text-xl font-black italic uppercase tracking-tighter flex items-center gap-3">
              <Banknote className="w-5 h-5 text-indigo-500" />
              Financial Records
           </h3>
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="p-6 bg-slate-950 border border-slate-800 rounded-[2rem] flex flex-col items-center justify-center text-center gap-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Input Cost</span>
                    <div className="flex items-center justify-center relative">
                       <span className="text-xl font-black italic text-emerald-500 absolute -left-4 md:-left-6">$</span>
                       <input 
                          type="number" value={data.cost || ''} 
                          onChange={(e) => setData({ ...data, cost: parseFloat(e.target.value) || 0 })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-full max-w-[120px] bg-transparent border-none outline-none text-2xl font-black italic p-0 text-center" 
                       />
                    </div>
                 </div>

                 <div className="p-6 bg-slate-950 border border-slate-800 rounded-[2rem] flex flex-col items-center justify-center text-center gap-2">
                    <div className="flex justify-between items-center w-full opacity-80 mb-2">
                      <span className="text-[9px] font-black text-white uppercase tracking-widest mx-auto">Market Valuation (Current)</span>
                    </div>
                    <div className="flex items-center justify-center relative">
                       <span className="text-3xl md:text-4xl font-black italic text-emerald-500 absolute -left-6 md:-left-8">$</span>
                       <input 
                          type="number" value={data.marketValue || ''} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setData({ ...data, marketValue: val, marketValueRaw: val });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className="bg-transparent border-none outline-none text-4xl md:text-6xl font-black italic p-0 text-white text-center w-fit max-w-[200px]" 
                       />
                    </div>
                    <p className="text-[7px] font-black text-white uppercase tracking-[0.2em] mt-3 leading-relaxed max-w-[280px] mx-auto">Always check eBay comps. Never 100% trust AI giving you a price. AI can and will make mistakes.</p>
                 </div>
              </div>

              <div className="p-8 bg-slate-950/50 border border-indigo-500/10 rounded-[2.5rem]">
                 <div className="flex items-center gap-4 mb-6">
                    <div className="h-px flex-1 bg-slate-800" />
                    <span className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Market Comps</span>
                    <div className="h-px flex-1 bg-slate-800" />
                 </div>
                 <div className={`grid ${(!data.isCoin && !data.isCurrency && !data.isStamp && !data.isComic) ? 'grid-cols-3' : 'grid-cols-2'} gap-2 md:gap-4 items-end`}>
                    <div className="flex flex-col gap-2 text-center group">
                      <div className="flex flex-col leading-tight min-h-[24px] justify-center">
                        <span className="text-[8px] font-black text-white uppercase tracking-widest">Raw</span>
                      </div>
                      <div className="bg-slate-900 py-3 md:py-4 rounded-2xl border border-slate-800 group-hover:border-slate-700 transition-all">
                        <span className="text-lg md:text-xl lg:text-2xl font-black italic text-slate-200">{formatDisplayValue(data.marketValueRaw || 0)}</span>
                      </div>
                    </div>
                    
                    {(!data.isCoin && !data.isCurrency && !data.isStamp && !data.isComic) ? (
                      <>
                        <div className="flex flex-col gap-2 text-center group">
                          <div className="flex flex-col leading-tight min-h-[24px] justify-center">
                            <span className="text-[8px] font-black text-yellow-500 uppercase tracking-widest">PSA 9</span>
                            <span className="text-[8px] font-black text-yellow-500 uppercase tracking-widest">NM-MT</span>
                          </div>
                          <div className="bg-slate-900 py-3 md:py-4 rounded-2xl border border-yellow-500/20 group-hover:border-yellow-500/40 transition-all shadow-lg shadow-yellow-500/5">
                            <span className="text-lg md:text-xl lg:text-2xl font-black italic text-yellow-400">{formatDisplayValue(data.marketValuePSA9 || 0)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 text-center group">
                          <div className="flex flex-col leading-tight min-h-[24px] justify-center">
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">PSA 10</span>
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">GEM MT</span>
                          </div>
                          <div className="bg-slate-900 py-3 md:py-4 rounded-2xl border border-emerald-500/10 group-hover:border-emerald-500/30 transition-all shadow-lg shadow-emerald-500/5">
                            <span className="text-lg md:text-xl lg:text-2xl font-black italic text-emerald-400">{formatDisplayValue(data.marketValuePSA10 || 0)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-2 text-center group">
                        <div className="flex flex-col leading-tight min-h-[24px] justify-center">
                          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Predicted</span>
                          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{data.estimatedGrade || 'Grade'}</span>
                        </div>
                        <div className="bg-slate-900 py-3 md:py-4 rounded-2xl border border-emerald-500/10 group-hover:border-emerald-500/30 transition-all shadow-lg shadow-emerald-500/5">
                          <span className="text-lg md:text-xl lg:text-2xl font-black italic text-emerald-400">
                            {formatDisplayValue(Number(data.gemMintProbability) > 0.6 ? (data.marketValuePSA10 || 0) : (data.marketValuePSA9 || 0))}
                          </span>
                        </div>
                      </div>
                    )}
                 </div>
              </div>
              <div className="flex flex-col items-center gap-4 mt-8">
                <button 
                  onClick={() => onReevaluate && onReevaluate(data)}
                  disabled={isReevaluating}
                  className="px-8 py-3 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 disabled:opacity-50"
                >
                  {isReevaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isReevaluating ? 'Re-evaluating...' : 'Re-evaluate Value'}
                </button>
                <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] text-center opacity-80">Use the links below to verify market comps</p>
              </div>
           </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <div className="flex gap-4 h-16">
            <button onClick={() => window.open(getEbayUrl('sold'))} className="flex-1 bg-slate-900 hover:bg-indigo-500 hover:text-white transition-all rounded-[2rem] flex items-center justify-center gap-3 border border-slate-800 text-xs font-black uppercase tracking-widest">
               <Tag className="w-4 h-4" /> Comps
            </button>
            <button onClick={() => window.open(getEbayUrl('active'))} className="flex-1 bg-slate-900 hover:bg-indigo-500 hover:text-white transition-all rounded-[2rem] flex items-center justify-center gap-3 border border-slate-800 text-xs font-black uppercase tracking-widest">
               <Search className="w-4 h-4" /> Buy Now
            </button>
          </div>
          <div className="flex gap-4">
             <button onClick={onFullReset || onCancel} className={`flex-1 py-6 bg-slate-900 border border-slate-800 hover:bg-slate-800 ${mode === 'scanner' ? 'text-red-500' : 'text-emerald-400'} font-black uppercase italic tracking-widest rounded-[2rem] transition-all`}>
               {mode === 'scanner' ? 'Discard Scan' : 'Return to Case'}
             </button>
             {mode === 'scanner' ? (
                <button onClick={onSave} disabled={isSaving} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-[2rem] font-black uppercase italic tracking-[0.2em] shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-4 transition-all hover:scale-[1.02] active:scale-95 disabled:grayscale">
                   {isSaving && <Loader2 className="w-6 h-6 animate-spin" />}
                   Secure to Case
                </button>
             ) : (
                <button onClick={() => onDelete(data.id)} className="flex-1 bg-red-600/10 border border-red-500/20 hover:bg-red-600 text-red-400 hover:text-white py-6 rounded-[2rem] font-black uppercase italic tracking-widest transition-all">Delete</button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
