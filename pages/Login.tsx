import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff, ShieldCheck, ChevronRight } from 'lucide-react';
import { db } from '../db';
import { User as UserType } from '../types';

interface LoginProps {
  onLogin: (user: UserType) => void;
  darkMode: boolean;
}

export default function Login({ onLogin, darkMode }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const user = await db.users.where('username').equals(username).first();
      
      if (user && user.password === password) {
        // Update last login
        await db.users.update(user.id!, { lastLogin: new Date() });
        
        // Remove password from object before state
        const { password: _, ...safeUser } = user;
        onLogin(safeUser as UserType);
      } else {
        setError('Invalid username or credential signature');
      }
    } catch (err) {
      setError('System authentication failure');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-[#0a0c10]' : 'bg-[#cfd3db]'}`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-red-500 rounded-full blur-[160px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-indigo-500 rounded-full blur-[160px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative w-full max-w-md rounded-[48px] overflow-hidden shadow-2xl transition-all duration-300 ${darkMode ? 'bg-[#161a20] border border-gray-800' : 'bg-white border border-gray-100 shadow-gray-200'}`}
      >
        <div className="p-10 sm:p-14">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="w-20 h-20 bg-red-500 rounded-[28px] flex items-center justify-center text-white shadow-2xl shadow-red-500/40 mb-6">
              <ShieldCheck size={40} />
            </div>
            <h1 className={`text-4xl font-black tracking-tighter uppercase mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Spectrum Pro
            </h1>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">Enterprise Access Hub</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Clearance Username</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-red-500">
                  <User size={18} />
                </div>
                <input 
                  required
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Samsoor"
                  className={`w-full pl-14 pr-6 py-4 rounded-2xl text-sm font-bold border-none ring-1 outline-none transition-all ${darkMode ? 'bg-gray-900 text-white ring-gray-800 focus:ring-red-500 shadow-inner' : 'bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500 shadow-sm'}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Access Signature</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-red-500">
                  <Lock size={18} />
                </div>
                <input 
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full pl-14 pr-14 py-4 rounded-2xl text-sm font-bold border-none ring-1 outline-none transition-all ${darkMode ? 'bg-gray-900 text-white ring-gray-800 focus:ring-red-500 shadow-inner' : 'bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500 shadow-sm'}`}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-black uppercase tracking-widest text-center"
              >
                {error}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-red-600/30 hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Authorize Entry <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-gray-800/10 text-center">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-loose">
              Spectrum Pro Management Systems v4.0.1<br />
              Authorized Personnel Only Beyond This Threshold
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}