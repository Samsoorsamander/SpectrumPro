
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Copy, Check, Plus, X, Beaker, RotateCcw, Save, Trash2, Droplets } from 'lucide-react';
import { COLOR_PALETTE } from '../constants';
import { db } from '../db';
import { ColorSwatch } from '../types';
import { LandscapeModal } from '../components/ui/LandscapeModal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { useOpenNewFromQuery } from '../hooks/useOpenNewFromQuery';
import { usePagination } from '../hooks/usePagination';

interface MixIngredient {
  color: ColorSwatch;
  parts: number;
}

export default function Catalog({ darkMode }: { darkMode: boolean }) {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [customColors, setCustomColors] = useState<ColorSwatch[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  
  // Mixer State
  const [mixIngredients, setMixIngredients] = useState<MixIngredient[]>([]);
  const [mixedColor, setMixedColor] = useState('#FFFFFF');

  // New Swatch Form State
  const [newSwatch, setNewSwatch] = useState<ColorSwatch>({
    name: '',
    hex: '#FF0000',
    company: 'Custom'
  });

  useEffect(() => {
    loadCustomSwatches();
  }, []);

  useEffect(() => {
    calculateMix();
  }, [mixIngredients]);

  const loadCustomSwatches = async () => {
    const swatches = await db.customSwatches.toArray();
    setCustomColors(swatches);
  };

  const handleCreateSwatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.customSwatches.add(newSwatch);
      setShowModal(false);
      setNewSwatch({ name: '', hex: '#FF0000', company: 'Custom' });
      loadCustomSwatches();
    } catch (err) {
      console.error("Failed to create swatch:", err);
    }
  };

  const copyToClipboard = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedColor(hex);
    setTimeout(() => setCopiedColor(null), 2000);
  };

  const combinedColors = useMemo(
    () => [...COLOR_PALETTE, ...customColors],
    [customColors]
  );
  const companies = useMemo(
    () => ['All', ...new Set(combinedColors.map(c => c.company))],
    [combinedColors]
  );
  const filteredColors = useMemo(
    () => (filter === 'All' ? combinedColors : combinedColors.filter(c => c.company === filter)),
    [combinedColors, filter]
  );

  const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    from,
    hasMore,
    loadMore,
  } = usePagination(filteredColors);

  // Mixer Functions
  const addIngredient = (color: ColorSwatch) => {
    if (mixIngredients.length >= 5) return; // Limit to 5 colors for mixing
    setMixIngredients([...mixIngredients, { color, parts: 1 }]);
  };

  const removeIngredient = (index: number) => {
    setMixIngredients(mixIngredients.filter((_, i) => i !== index));
  };

  const updateParts = (index: number, parts: number) => {
    const newIngredients = [...mixIngredients];
    newIngredients[index].parts = Math.max(1, parts);
    setMixIngredients(newIngredients);
  };

  const calculateMix = () => {
    if (mixIngredients.length === 0) {
      setMixedColor('#FFFFFF');
      return;
    }

    let r = 0, g = 0, b = 0;
    let totalParts = 0;

    mixIngredients.forEach(ing => {
      const hex = ing.color.hex.replace('#', '');
      const ir = parseInt(hex.substring(0, 2), 16);
      const ig = parseInt(hex.substring(2, 4), 16);
      const ib = parseInt(hex.substring(4, 6), 16);

      r += ir * ing.parts;
      g += ig * ing.parts;
      b += ib * ing.parts;
      totalParts += ing.parts;
    });

    const fr = Math.round(r / totalParts).toString(16).padStart(2, '0');
    const fg = Math.round(g / totalParts).toString(16).padStart(2, '0');
    const fb = Math.round(b / totalParts).toString(16).padStart(2, '0');

    setMixedColor(`#${fr}${fg}${fb}`);
  };

  const saveMixedColor = () => {
    setNewSwatch({
      name: 'Custom Mix',
      hex: mixedColor,
      company: 'Custom Mix'
    });
    setShowMixer(false);
    setShowModal(true);
  };

  const openAdd = () => {
    setNewSwatch({ name: '', hex: '#FF0000', company: 'Custom' });
    setShowModal(true);
  };

  useOpenNewFromQuery(openAdd);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Color Catalog</h2>
          <p className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Brand shades & mixer</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={() => setShowMixer(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all font-medium text-xs border ${darkMode ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}
          >
            <Beaker size={14} /> Mixer
          </button>
          <button 
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-medium text-xs shadow-lg"
          >
            <Plus size={14} /> Create Swatch
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
        {companies.map(comp => (
          <button
            key={comp}
            onClick={() => setFilter(comp)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              filter === comp 
                ? 'bg-red-500 text-white' 
                : `${darkMode ? 'bg-[#1a1d23] text-gray-400 border border-gray-800' : 'bg-white text-gray-500 shadow-sm border border-gray-100'}`
            }`}
          >
            {comp}
          </button>
        ))}
      </div>

      <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 p-4">
          {pageItems.map((color, i) => (
            <motion.div 
              key={`${color.hex}-${from + i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (i % 20) * 0.03 }}
              className={`group p-4 rounded-3xl transition-all cursor-pointer ${darkMode ? 'bg-[#14171c] border border-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}
            >
              <div 
                className="w-full h-32 rounded-2xl mb-4 shadow-inner relative flex items-center justify-center"
                style={{ backgroundColor: color.hex }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                  <button 
                    onClick={() => copyToClipboard(color.hex)}
                    className="bg-white/20 p-2 rounded-lg text-white hover:bg-white/40 transition-colors"
                    title="Copy Hex"
                  >
                    {copiedColor === color.hex ? <Check size={20} /> : <Copy size={20} />}
                  </button>
                  <button 
                    onClick={() => addIngredient(color)}
                    className="bg-indigo-500 p-2 rounded-lg text-white hover:bg-indigo-600 transition-colors"
                    title="Add to Mixer"
                  >
                    <Beaker size={20} />
                  </button>
                </div>
              </div>
              <h4 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'} truncate`}>{color.name}</h4>
              <div className="flex justify-between items-center mt-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">{color.company}</p>
                <p className="text-xs font-mono text-gray-400 uppercase">{color.hex}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <PaginationBar
          darkMode={darkMode}
          total={total}
          shown={shown}
          hasMore={hasMore}
          onLoadMore={loadMore}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Color Mixer Interface */}
      <AnimatePresence>
        {showMixer && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMixer(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className={`relative w-full max-w-5xl max-h-[min(72vh,520px)] h-[min(72vh,520px)] rounded-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white shadow-2xl'}`}
            >
              <div className="px-4 py-2.5 flex justify-between items-center border-b border-gray-800/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white">
                    <Beaker size={16} />
                  </div>
                  <div>
                    <h3 className={`text-sm font-black uppercase tracking-wide ${darkMode ? 'text-white' : 'text-gray-900'}`}>Spectrum Mixing Lab</h3>
                    <p className="text-[9px] text-gray-500 font-bold">Mix up to 5 colors from the catalog</p>
                  </div>
                </div>
                <button onClick={() => setShowMixer(false)} className="p-1.5 text-gray-500 hover:text-red-500 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">
                {/* Ingredients Panel */}
                <div className={`w-full lg:w-2/3 p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3 ${darkMode ? 'bg-black/20' : 'bg-gray-50'}`}>
                  <div className="flex justify-between items-center">
                    <h4 className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Active Ingredients</h4>
                    <button 
                      onClick={() => setMixIngredients([])}
                      className="text-[10px] font-bold text-red-500 flex items-center gap-1 hover:underline"
                    >
                      <RotateCcw size={12} /> Clear All
                    </button>
                  </div>

                  <div className="space-y-4">
                    {mixIngredients.map((ing, idx) => (
                      <motion.div 
                        key={idx}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-5 rounded-[28px] border flex items-center gap-6 transition-all ${darkMode ? 'bg-[#0f1115] border-gray-800' : 'bg-white shadow-sm border-gray-200'}`}
                      >
                        <div 
                          className="w-16 h-16 rounded-[20px] shadow-lg flex-shrink-0" 
                          style={{ backgroundColor: ing.color.hex }} 
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} truncate`}>{ing.color.name}</p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest">{ing.color.company} • {ing.color.hex}</p>
                        </div>
                        <div className="flex items-center gap-4 w-48">
                          <div className="flex-1">
                            <input 
                              type="range" 
                              min="1" 
                              max="10" 
                              value={ing.parts} 
                              onChange={(e) => updateParts(idx, parseInt(e.target.value))}
                              className="w-full accent-indigo-500"
                            />
                          </div>
                          <span className={`w-12 text-center text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {ing.parts} <span className="text-[10px] text-gray-500">pts</span>
                          </span>
                        </div>
                        <button 
                          onClick={() => removeIngredient(idx)}
                          className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </motion.div>
                    ))}

                    {mixIngredients.length === 0 && (
                      <div className="py-20 flex flex-col items-center justify-center text-center opacity-30 gap-4">
                        <Droplets size={48} className="text-gray-500" />
                        <p className="text-sm font-bold text-gray-500 max-w-xs uppercase tracking-widest leading-loose">
                          Pick colors from the catalog to start experimenting in the lab
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Preview Panel */}
                <div className="w-full lg:w-1/3 p-10 flex flex-col items-center justify-center gap-8 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10 blur-3xl pointer-events-none" style={{ backgroundColor: mixedColor }} />
                  
                  <div className="relative z-10 w-full flex flex-col items-center gap-6">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-2">Mixed Result</p>
                      <h4 className={`text-3xl font-black uppercase tracking-tighter ${darkMode ? 'text-white' : 'text-gray-900'}`}>{mixedColor}</h4>
                    </div>

                    <motion.div 
                      key={mixedColor}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-48 h-48 rounded-[60px] shadow-2xl relative flex items-center justify-center overflow-hidden border-8 border-white/10"
                      style={{ backgroundColor: mixedColor }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                    </motion.div>

                    <div className="w-full space-y-3 pt-6">
                      <button 
                        onClick={() => copyToClipboard(mixedColor)}
                        className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all ${darkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                      >
                        <Copy size={16} /> Copy Hex Code
                      </button>
                      <button 
                        onClick={saveMixedColor}
                        disabled={mixIngredients.length === 0}
                        className="w-full py-4 bg-indigo-500 text-white rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/30 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        <Save size={16} /> Save to Catalog
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Swatch Modal */}
      <AnimatePresence>
        {showModal && (
          <LandscapeModal
            darkMode={darkMode}
            open={showModal}
            onClose={() => setShowModal(false)}
            title="New Color Swatch"
            icon={<Palette size={16} />}
            footer={
              <>
                <button type="button" onClick={() => setShowModal(false)} className={`flex-1 py-2.5 rounded-xl font-bold text-xs ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>Cancel</button>
                <button type="submit" form="swatch-form" className="flex-[2] py-2.5 bg-red-500 text-white rounded-xl font-bold text-xs shadow-lg">Save Color</button>
              </>
            }
          >
            <form id="swatch-form" onSubmit={handleCreateSwatch} className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-500">Color Name</label>
                <input required type="text" value={newSwatch.name} onChange={e => setNewSwatch({...newSwatch, name: e.target.value})} placeholder="e.g. Midnight Blue" className={`w-full px-3 py-2 rounded-lg text-xs ${darkMode ? 'bg-[#0f1115] text-white border-gray-800' : 'bg-gray-50 text-gray-900 border-gray-200'} border outline-none`} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-500">Brand / Company</label>
                <input required type="text" value={newSwatch.company} onChange={e => setNewSwatch({...newSwatch, company: e.target.value})} placeholder="e.g. Custom" className={`w-full px-3 py-2 rounded-lg text-xs ${darkMode ? 'bg-[#0f1115] text-white border-gray-800' : 'bg-gray-50 text-gray-900 border-gray-200'} border outline-none`} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-gray-500">Hex Code</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={newSwatch.hex} onChange={e => setNewSwatch({...newSwatch, hex: e.target.value})} className="w-9 h-9 rounded-lg overflow-hidden border-none p-0 cursor-pointer" />
                  <input required type="text" value={newSwatch.hex} onChange={e => setNewSwatch({...newSwatch, hex: e.target.value})} className={`flex-1 px-3 py-2 rounded-lg text-xs font-mono uppercase ${darkMode ? 'bg-[#0f1115] text-white border-gray-800' : 'bg-gray-50 text-gray-900 border-gray-200'} border outline-none`} />
                </div>
              </div>
            </form>
          </LandscapeModal>
        )}
      </AnimatePresence>
    </div>
  );
}
