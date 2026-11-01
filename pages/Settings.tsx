import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trash2, Check, Shield, Camera, RefreshCw, HardDrive
} from 'lucide-react';
import { db } from '../db';
import { User, UserRole, SystemSettings } from '../types';
import { readSqliteBackupMeta, triggerSqliteBackupNow, type SqliteBackupMeta } from '../utils/dailySqliteBackup';
import { useFeedback } from '../contexts/FeedbackContext';

export default function Settings({ darkMode, currentUser }: { darkMode: boolean, currentUser: User | null }) {
  const navigate = useNavigate();
  const { showSuccess, showError } = useFeedback();
  const [activeTab, setActiveTab] = useState<'BACKUP' | 'USERS' | 'PROFILE'>('PROFILE');
  
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingBackupEmailTest, setIsSendingBackupEmailTest] = useState(false);
  
  const [businessSettings, setBusinessSettings] = useState<SystemSettings>({
    companyName: '',
    phone: '',
    address: '',
    representativeName: '',
    logo: '',
    logos: [],
    selectedLogoIndex: 0,
    whatsappNumber: '',
    dailyBackupEnabled: true,
    backupEmailEnabled: false,
    backupEmailTo: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    smtpFrom: ''
  });

  const [sqliteBackupMeta, setSqliteBackupMeta] = useState<SqliteBackupMeta | null>(null);

  const latestSettingsRow = (rows: SystemSettings[]) =>
    [...rows].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0];

  const smtpPass = businessSettings.smtpPassword || "";
  const smtpPassTrimmed = smtpPass.trim();
  const smtpDebug = {
    usernameTrimmed: (businessSettings.smtpUsername || "").trim(),
    fromTrimmed: (businessSettings.smtpFrom || "").trim(),
    toTrimmed: (businessSettings.backupEmailTo || "").trim(),
    hostTrimmed: (businessSettings.smtpHost || "").trim(),
    passLen: smtpPass.length,
    passTrimmedLen: smtpPassTrimmed.length,
    hasLeadingOrTrailingWhitespace: smtpPass !== smtpPassTrimmed,
    hasInternalWhitespace: /\s/.test(smtpPassTrimmed),
    passMask:
      smtpPassTrimmed.length >= 2
        ? `${"*".repeat(Math.max(0, smtpPassTrimmed.length - 2))}${smtpPassTrimmed.slice(-2)}`
        : smtpPassTrimmed.length === 1
          ? "*"
          : "empty",
  };

  useEffect(() => {
    if (currentUser?.role === UserRole.ADMIN) {
      loadBusinessSettings();
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === "BACKUP") setSqliteBackupMeta(readSqliteBackupMeta());
  }, [activeTab]);

  const loadBusinessSettings = async () => {
    const s = await db.settings.toArray();
    if (s.length > 0) {
      const data = latestSettingsRow(s);
      setBusinessSettings({
        ...data,
        logos: Array.isArray(data.logos) ? data.logos : [],
        selectedLogoIndex: data.selectedLogoIndex || 0
      });
      setSqliteBackupMeta(readSqliteBackupMeta());
    }
  };

  const handleSaveBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    try {
      const payload = {
        companyName: businessSettings.companyName ?? "",
        phone: businessSettings.phone ?? "",
        address: businessSettings.address ?? "",
        representativeName: businessSettings.representativeName ?? "",
        logo: businessSettings.logo ?? "",
        logos: Array.isArray(businessSettings.logos) ? businessSettings.logos : [],
        selectedLogoIndex: Number(businessSettings.selectedLogoIndex) || 0,
        whatsappNumber: businessSettings.whatsappNumber ?? "",
        dailyBackupEnabled: Boolean(businessSettings.dailyBackupEnabled),
        lastBackupDate: businessSettings.lastBackupDate ?? null,
        backupEmailEnabled: Boolean(businessSettings.backupEmailEnabled),
        backupEmailTo: businessSettings.backupEmailTo ?? "",
        smtpHost: businessSettings.smtpHost ?? "",
        smtpPort: Number(businessSettings.smtpPort) || 587,
        smtpUsername: businessSettings.smtpUsername ?? "",
        smtpPassword: businessSettings.smtpPassword ?? "",
        smtpFrom: businessSettings.smtpFrom ?? "",
      };
      const existing = await db.settings.toArray();
      if (existing.length > 0) {
        const id = latestSettingsRow(existing).id!;
        await db.settings.update(id, payload);
      } else {
        await db.settings.add(payload);
      }
      showSuccess("Profile saved", "Business identity profile synchronized.");
      await loadBusinessSettings();
    } catch (err: any) {
      console.error("Settings save error:", err);
      showError("Could not save profile", err?.message || String(err));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newLogos = [...(businessSettings.logos || []), reader.result as string];
        setBusinessSettings({ 
          ...businessSettings, 
          logos: newLogos,
          logo: newLogos[newLogos.length - 1] // Legacy sync
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = (index: number) => {
    const newLogos = [...(businessSettings.logos || [])];
    newLogos.splice(index, 1);
    setBusinessSettings({ 
      ...businessSettings, 
      logos: newLogos,
      selectedLogoIndex: 0 
    });
  };

  const handleSendBackupEmailTest = async () => {
    if (isSendingBackupEmailTest) return;
    setIsSendingBackupEmailTest(true);
    try {
      const s = await db.settings.toArray();
      const current = s.length ? latestSettingsRow(s) : null;
      if (!current || !current.backupEmailEnabled) {
        showError("Email backup disabled", "Enable Backup Email Dispatch and save profile first.");
        return;
      }
      if (!current.backupEmailTo || !current.smtpHost || !current.smtpUsername || !current.smtpPassword || !current.smtpFrom) {
        showError("Email settings missing", "Fill recipient + SMTP fields and save profile first.");
        return;
      }
      await triggerSqliteBackupNow();
      await loadBusinessSettings();
      setSqliteBackupMeta(readSqliteBackupMeta());
      showSuccess("Test email sent", "Backup file created and email dispatch triggered.");
    } catch (err: any) {
      showError("Test email failed", err?.message || String(err));
    } finally {
      setIsSendingBackupEmailTest(false);
    }
  };

  return (
    <div className="space-y-8 w-full pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tight uppercase`}>System Core</h2>
          <p className="text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">Registry Configuration & Identity Profile</p>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 rounded-3xl w-fit bg-gray-500/10 backdrop-blur-md">
        {(['PROFILE', 'BACKUP', 'USERS'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>{tab === 'PROFILE' ? 'Business ID' : tab === 'BACKUP' ? 'Maintenance' : 'Access Control'}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-h-[600px]">
          <AnimatePresence mode="wait">
            {activeTab === 'PROFILE' ? (
              <motion.div key="profile" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className={`p-10 rounded-[56px] border ${darkMode ? 'bg-[#1a1d23] border-gray-800 shadow-2xl' : 'bg-white shadow-xl'}`}>
                <form onSubmit={handleSaveBusinessSettings} className="space-y-10">
                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">Brand Assets (Logos)</label>
                    <div className="flex flex-wrap gap-4 items-center">
                       {businessSettings.logos?.map((lg, idx) => (
                         <div key={idx} className={`relative group w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all ${businessSettings.selectedLogoIndex === idx ? 'border-red-500' : 'border-gray-800/20'}`}>
                           <img src={lg} className="w-full h-full object-contain cursor-pointer" onClick={() => setBusinessSettings({...businessSettings, selectedLogoIndex: idx})} />
                           <button type="button" onClick={() => removeLogo(idx)} className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                           {businessSettings.selectedLogoIndex === idx && <div className="absolute bottom-1 right-1 bg-red-500 text-white p-0.5 rounded-full"><Check size={10} /></div>}
                         </div>
                       ))}
                       <label className={`w-24 h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${darkMode ? 'bg-black/20 border-gray-700 hover:border-red-500' : 'bg-gray-50 border-gray-200 hover:border-red-500'}`}>
                          <Camera size={20} className="text-gray-500 mb-1" />
                          <span className="text-[8px] font-black uppercase text-gray-500">Add Seal</span>
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                       </label>
                    </div>
                    <p className="text-[9px] text-gray-500 font-bold uppercase">Logos uploaded here will display on official trade documents.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">Registered Entity Name</label><input required value={businessSettings.companyName} onChange={e => setBusinessSettings({...businessSettings, companyName: e.target.value})} className={`w-full px-6 py-4 rounded-2xl text-sm font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800 focus:ring-red-500' : 'bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500 shadow-inner'}`} /></div>
                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">Primary Rep Name</label><input required value={businessSettings.representativeName} onChange={e => setBusinessSettings({...businessSettings, representativeName: e.target.value})} className={`w-full px-6 py-4 rounded-2xl text-sm font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50'}`} /></div>
                       <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">Official Hotline #</label><input required value={businessSettings.phone} onChange={e => setBusinessSettings({...businessSettings, phone: e.target.value})} className={`w-full px-6 py-4 rounded-2xl text-sm font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50'}`} /></div>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">Physical Location Address</label><input required value={businessSettings.address} onChange={e => setBusinessSettings({...businessSettings, address: e.target.value})} className={`w-full px-6 py-4 rounded-2xl text-sm font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50'}`} /></div>
                  </div>
                  <button type="submit" disabled={isSavingProfile} className={`w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl transition-all hover:scale-[1.01] flex items-center justify-center gap-4`}>
                    {isSavingProfile ? <RefreshCw className="animate-spin" size={18} /> : 'SYNCHRONIZE IDENTITY PROFILE'}
                  </button>
                </form>
              </motion.div>
            ) : activeTab === 'BACKUP' ? (
              <motion.div key="backup" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className={`p-10 rounded-[56px] border ${darkMode ? 'bg-[#1a1d23] border-gray-800 shadow-2xl' : 'bg-white shadow-xl'}`}>
                <div className="grid grid-cols-1 gap-8">
                   <div className={`p-8 rounded-[40px] border-2 border-dashed flex flex-col gap-6 ${darkMode ? 'border-gray-800 bg-gray-900/10' : 'border-gray-100 bg-gray-50/10'}`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-2xl ${darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                          <HardDrive size={22} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-1">Full multi-drive backup</p>
                          <h4 className="text-lg font-black uppercase">Backup &amp; Restore Center</h4>
                          <p className={`text-[11px] mt-2 leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Manual and automatic 24-hour backups of the full database, copies to every writable drive (30 files each), and verified restore that signs you out so only the backup owner's login can reopen the data.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/backup')}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-3 hover:bg-emerald-700"
                      >
                        <HardDrive size={18} /> Open Backup &amp; Restore
                      </button>
                      {sqliteBackupMeta && (
                        <p className="text-[9px] font-bold text-gray-500 break-all">
                          Last backup: {new Date(sqliteBackupMeta.at).toLocaleString()}
                          {sqliteBackupMeta.primaryPath ? ` — ${sqliteBackupMeta.primaryPath}` : ""}
                          {sqliteBackupMeta.driveCount != null ? ` · ${sqliteBackupMeta.driveCount} drive(s)` : ""}
                        </p>
                      )}
                   </div>
                   <div className={`p-8 rounded-[40px] border-2 border-dashed flex flex-col gap-4 ${darkMode ? 'border-gray-800 bg-gray-900/10' : 'border-gray-100 bg-gray-50/10'}`}>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-500 mb-1">Backup Email Dispatch</p>
                        <h4 className="text-lg font-black uppercase">Email after backup</h4>
                      </div>
                      <label className="flex items-center gap-4 cursor-pointer">
                        <div className={`w-14 h-7 rounded-full relative transition-colors ${businessSettings.backupEmailEnabled ? 'bg-emerald-600' : 'bg-gray-800'}`} onClick={() => setBusinessSettings({...businessSettings, backupEmailEnabled: !businessSettings.backupEmailEnabled})}>
                          <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${businessSettings.backupEmailEnabled ? 'left-8' : 'left-1'}`} />
                        </div>
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">{businessSettings.backupEmailEnabled ? 'Enabled' : 'Disabled'}</span>
                      </label>
                      <input placeholder="Recipient email" value={businessSettings.backupEmailTo || ''} onChange={e => setBusinessSettings({...businessSettings, backupEmailTo: e.target.value})} className={`w-full px-4 py-3 rounded-xl text-xs font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-white'}`} />
                      <div className="grid grid-cols-2 gap-3">
                        <input placeholder="SMTP host (e.g. smtp.gmail.com)" value={businessSettings.smtpHost || ''} onChange={e => setBusinessSettings({...businessSettings, smtpHost: e.target.value})} className={`w-full px-4 py-3 rounded-xl text-xs font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-white'}`} />
                        <input type="number" placeholder="Port" value={businessSettings.smtpPort || 587} onChange={e => setBusinessSettings({...businessSettings, smtpPort: Number(e.target.value) || 587})} className={`w-full px-4 py-3 rounded-xl text-xs font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-white'}`} />
                      </div>
                      <input placeholder="SMTP username" value={businessSettings.smtpUsername || ''} onChange={e => setBusinessSettings({...businessSettings, smtpUsername: e.target.value})} className={`w-full px-4 py-3 rounded-xl text-xs font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-white'}`} />
                      <input type="password" placeholder="SMTP app password" value={businessSettings.smtpPassword || ''} onChange={e => setBusinessSettings({...businessSettings, smtpPassword: e.target.value})} className={`w-full px-4 py-3 rounded-xl text-xs font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-white'}`} />
                      <input placeholder="From email" value={businessSettings.smtpFrom || ''} onChange={e => setBusinessSettings({...businessSettings, smtpFrom: e.target.value})} className={`w-full px-4 py-3 rounded-xl text-xs font-bold border-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-white'}`} />
                      <button
                        type="button"
                        onClick={handleSendBackupEmailTest}
                        disabled={isSendingBackupEmailTest}
                        className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                          isSendingBackupEmailTest
                            ? "bg-gray-700 text-gray-300 cursor-not-allowed"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {isSendingBackupEmailTest ? "Sending test..." : "Send test backup email"}
                      </button>
                      <div className={`p-4 rounded-xl border text-[9px] font-bold leading-relaxed ${darkMode ? 'border-gray-800 bg-black/20 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                        <p className="uppercase tracking-widest mb-2 text-[8px]">Safe SMTP debug (no secrets exposed)</p>
                        <p>Host: {smtpDebug.hostTrimmed || "empty"}</p>
                        <p>User: {smtpDebug.usernameTrimmed || "empty"}</p>
                        <p>From: {smtpDebug.fromTrimmed || "empty"}</p>
                        <p>To: {smtpDebug.toTrimmed || "empty"}</p>
                        <p>Password length: {smtpDebug.passLen} (trimmed: {smtpDebug.passTrimmedLen})</p>
                        <p>Password masked: {smtpDebug.passMask}</p>
                        <p>Leading/trailing spaces: {smtpDebug.hasLeadingOrTrailingWhitespace ? "YES" : "NO"}</p>
                        <p>Internal spaces/newlines: {smtpDebug.hasInternalWhitespace ? "YES" : "NO"}</p>
                      </div>
                      <p className="text-[9px] text-gray-500 font-bold">Save profile (Business ID tab) after editing these values.</p>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="users" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className={`p-10 rounded-[56px] border ${darkMode ? 'bg-[#1a1d23] border-gray-800 shadow-2xl' : 'bg-white shadow-xl'}`}>
                <div className={`p-8 rounded-[40px] border-2 border-dashed flex flex-col gap-6 ${darkMode ? 'border-gray-800 bg-gray-900/10' : 'border-gray-100 bg-gray-50/10'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-2xl ${darkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'}`}>
                      <Shield size={22} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-500 mb-1">Users &amp; rights</p>
                      <h4 className="text-lg font-black uppercase">Access Control</h4>
                      <p className={`text-[11px] mt-2 leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Create staff accounts and assign Read or Write permission for each screen.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/access-control')}
                    className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-3 hover:bg-red-700"
                  >
                    <Shield size={18} /> Open Access Control
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={`p-10 rounded-[56px] border transition-all h-fit ${darkMode ? 'bg-[#1a1d23] border-gray-800 shadow-2xl' : 'bg-white shadow-xl'}`}>
           <Shield size={40} className="text-red-500 mb-6" />
           <h4 className={`text-lg font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Session Authority</h4>
           <div className={`p-6 rounded-[32px] ${darkMode ? 'bg-black/60 border border-gray-800' : 'bg-gray-50 border border-gray-100'} space-y-4 shadow-inner`}>
              <div><p className={`text-[8px] font-black uppercase mb-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Authorized ID</p><p className={`text-sm font-black ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{currentUser?.fullName}</p></div>
              <div><p className={`text-[8px] font-black uppercase mb-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Clearance Tier</p><p className="text-sm font-black text-red-500">{currentUser?.role}</p></div>
              <div className={`pt-4 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}><p className={`text-[8px] font-black uppercase mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Hardware Nodes</p><p className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Active Browser Session</p></div>
           </div>
        </div>
      </div>
    </div>
  );
}