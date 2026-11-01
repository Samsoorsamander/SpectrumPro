import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Edit2,
  Eye,
  PenLine,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { db } from "../db";
import { User, UserRole } from "../types";
import {
  SIDEBAR_ITEMS,
  BOTTOM_SIDEBAR_ITEMS,
  SETTINGS_MENU_ITEMS,
} from "../constants";
import { useFeedback } from "../contexts/FeedbackContext";
import {
  getModuleAccessLevel,
  setModuleAccess,
  type ModuleAccessLevel,
} from "../utils/permissions";

type UserForm = {
  username: string;
  password: string;
  role: UserRole;
  fullName: string;
  permissions: string[];
};

const emptyForm = (): UserForm => ({
  username: "",
  password: "",
  role: UserRole.STAFF,
  fullName: "",
  permissions: ["dashboard:read"],
});

function buildAssignableModules() {
  const seen = new Set<string>();
  const list: { id: string; label: string; icon: React.ReactNode }[] = [];
  const push = (id: string, label: string, icon: React.ReactNode) => {
    if (seen.has(id)) return;
    seen.add(id);
    list.push({ id, label, icon });
  };
  for (const item of SIDEBAR_ITEMS) push(item.id, item.label, item.icon);
  for (const item of BOTTOM_SIDEBAR_ITEMS) push(item.id, item.label, item.icon);
  for (const item of SETTINGS_MENU_ITEMS) {
    if (item.id === "access-control") continue;
    push(item.id, item.label, item.icon);
  }
  push("backup", "Backup & Restore", SETTINGS_MENU_ITEMS.find((i) => i.id === "backup")?.icon);
  return list;
}

export default function AccessControl({
  darkMode,
  currentUser,
}: {
  darkMode: boolean;
  currentUser: User | null;
}) {
  const navigate = useNavigate();
  const { showSuccess, showError } = useFeedback();
  const modules = useMemo(() => buildAssignableModules(), []);

  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());

  const panel = darkMode
    ? "bg-[#1a1d23] border-gray-800"
    : "bg-[#e2e5eb] border-gray-300 shadow-sm";
  const muted = darkMode ? "text-gray-400" : "text-gray-500";

  const loadUsers = async () => {
    setUsers(await db.users.toArray());
  };

  useEffect(() => {
    if (currentUser?.role === UserRole.ADMIN) loadUsers();
  }, [currentUser]);

  if (currentUser?.role !== UserRole.ADMIN) {
    return (
      <div className={`rounded-2xl border p-8 ${panel}`}>
        <p className={`text-sm font-bold ${muted}`}>
          Only administrators can manage user access.
        </p>
      </div>
    );
  }

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditingId(user.id ?? null);
    setForm({
      username: user.username,
      password: user.password || "",
      role: user.role,
      fullName: user.fullName,
      permissions: user.permissions || [],
    });
    setShowModal(true);
  };

  const setLevel = (moduleId: string, level: ModuleAccessLevel) => {
    setForm((prev) => ({
      ...prev,
      permissions: setModuleAccess(prev.permissions, moduleId, level),
    }));
  };

  const setAll = (level: ModuleAccessLevel) => {
    setForm((prev) => {
      let next = [...prev.permissions];
      for (const m of modules) {
        next = setModuleAccess(next, m.id, level);
      }
      return { ...prev, permissions: next };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        fullName: form.fullName.trim(),
        permissions:
          form.role === UserRole.ADMIN
            ? modules.map((m) => `${m.id}:write`)
            : form.permissions,
      };
      if (!payload.username || !payload.fullName || !payload.password) {
        showError("Missing fields", "Name, username, and password are required.");
        return;
      }
      if (editingId) await db.users.update(editingId, payload);
      else await db.users.add(payload);
      setShowModal(false);
      await loadUsers();
      showSuccess("User saved", "Access rights updated.");
    } catch {
      showError("Could not save user", "Username may already exist.");
    }
  };

  const deleteUser = async (id: number) => {
    if (id === currentUser?.id) {
      showError("Not allowed", "You cannot delete your own account.");
      return;
    }
    if (!window.confirm("Delete this user?")) return;
    await db.users.delete(id);
    await loadUsers();
    showSuccess("User removed", "Account deleted.");
  };

  const summarizeRights = (user: User) => {
    if (user.role === UserRole.ADMIN) return "Full admin";
    const perms = user.permissions || [];
    let read = 0;
    let write = 0;
    for (const m of modules) {
      const level = getModuleAccessLevel(perms, m.id);
      if (level === "write") write += 1;
      else if (level === "read") read += 1;
    }
    return `${write} write · ${read} read-only`;
  };

  return (
    <div className="space-y-4 pb-8 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className={`p-2 rounded-xl ${darkMode ? "bg-gray-800 text-gray-300" : "bg-white border text-gray-600"}`}
          title="Back to settings"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h2 className={`text-lg font-black uppercase tracking-tight ${darkMode ? "text-white" : "text-gray-900"}`}>
            Access Control
          </h2>
          <p className={`text-[11px] font-medium ${muted}`}>
            Create users and assign Read or Write rights per screen
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-red-700"
        >
          <UserPlus size={14} /> New user
        </button>
      </div>

      <div className={`rounded-2xl border p-4 ${panel}`}>
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-red-500" />
          <h3 className={`text-xs font-black uppercase tracking-widest ${darkMode ? "text-white" : "text-gray-900"}`}>
            Users ({users.length})
          </h3>
        </div>
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                darkMode ? "bg-black/30 border-gray-800" : "bg-white/70 border-gray-200"
              }`}
            >
              <div className="min-w-0">
                <p className={`text-sm font-black truncate ${darkMode ? "text-white" : "text-gray-900"}`}>
                  {user.fullName}
                </p>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                  @{user.username} · {user.role} · {summarizeRights(user)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(user)}
                  className={`p-2 rounded-lg ${darkMode ? "bg-gray-800 text-gray-300 hover:text-indigo-400" : "bg-gray-100 text-gray-600 hover:text-indigo-600"}`}
                >
                  <Edit2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => user.id && deleteUser(user.id)}
                  className={`p-2 rounded-lg ${darkMode ? "bg-gray-800 text-gray-300 hover:text-red-400" : "bg-gray-100 text-gray-600 hover:text-red-600"}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className={`text-xs font-bold ${muted}`}>No users yet.</p>
          )}
        </div>
      </div>

      <div className={`rounded-2xl border p-4 flex gap-3 ${panel}`}>
        <Shield className="text-red-500 shrink-0" size={20} />
        <div className={`text-[11px] leading-relaxed font-medium ${muted}`}>
          <p className="font-black uppercase tracking-wider text-[10px] mb-1">
            How rights work
          </p>
          <p>
            <strong>Read</strong> — user can open the screen and view data.{" "}
            <strong>Write</strong> — user can create, edit, and delete (includes read).
            Admins always have full access.
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className={`relative w-full max-w-3xl max-h-[min(85vh,640px)] overflow-y-auto rounded-2xl border p-5 ${
                darkMode ? "bg-[#161a20] border-gray-800 text-white" : "bg-[#eef0f3] border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-600 text-white rounded-xl">
                    <UserPlus size={18} />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest">
                    {editingId ? "Edit user rights" : "Create user"}
                  </h3>
                </div>
                <button type="button" onClick={() => setShowModal(false)} className="text-gray-500 hover:text-red-500">
                  <X size={22} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-widest px-1 ${muted}`}>Full name</label>
                    <input
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm font-bold border-none ring-1 outline-none ${
                        darkMode ? "bg-gray-900 ring-gray-800 text-white" : "bg-white ring-gray-200"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-widest px-1 ${muted}`}>Role</label>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        setForm({ ...form, role: e.target.value as UserRole })
                      }
                      className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm font-bold border-none ring-1 outline-none ${
                        darkMode ? "bg-gray-900 ring-gray-800 text-white" : "bg-white ring-gray-200"
                      }`}
                    >
                      <option value={UserRole.STAFF}>Staff</option>
                      <option value={UserRole.ADMIN}>Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-widest px-1 ${muted}`}>Username</label>
                    <input
                      required
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm font-bold border-none ring-1 outline-none ${
                        darkMode ? "bg-gray-900 ring-gray-800 text-white" : "bg-white ring-gray-200"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-widest px-1 ${muted}`}>Password</label>
                    <input
                      required
                      type="text"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm font-bold border-none ring-1 outline-none ${
                        darkMode ? "bg-gray-900 ring-gray-800 text-white" : "bg-white ring-gray-200"
                      }`}
                    />
                  </div>
                </div>

                {form.role === UserRole.STAFF && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>
                        Screen rights
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAll("read")}
                          className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${darkMode ? "bg-gray-800" : "bg-white border"}`}
                        >
                          All read
                        </button>
                        <button
                          type="button"
                          onClick={() => setAll("write")}
                          className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${darkMode ? "bg-gray-800" : "bg-white border"}`}
                        >
                          All write
                        </button>
                        <button
                          type="button"
                          onClick={() => setAll("none")}
                          className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${darkMode ? "bg-gray-800" : "bg-white border"}`}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {modules.map((m) => {
                        const level = getModuleAccessLevel(form.permissions, m.id);
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
                              darkMode ? "border-gray-800 bg-black/20" : "border-gray-200 bg-white/80"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`shrink-0 ${muted}`}>{m.icon}</span>
                              <span className={`text-[11px] font-black uppercase truncate ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                                {m.label}
                              </span>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                title="Read only"
                                onClick={() =>
                                  setLevel(m.id, level === "read" ? "none" : "read")
                                }
                                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 ${
                                  level === "read"
                                    ? "bg-sky-600 text-white"
                                    : level === "write"
                                      ? darkMode
                                        ? "bg-gray-800 text-gray-500"
                                        : "bg-gray-100 text-gray-400"
                                      : darkMode
                                        ? "bg-gray-900 text-gray-500"
                                        : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                <Eye size={11} /> Read
                              </button>
                              <button
                                type="button"
                                title="Read & write"
                                onClick={() =>
                                  setLevel(m.id, level === "write" ? "none" : "write")
                                }
                                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 ${
                                  level === "write"
                                    ? "bg-emerald-600 text-white"
                                    : darkMode
                                      ? "bg-gray-900 text-gray-500"
                                      : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                <PenLine size={11} /> Write
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.role === UserRole.ADMIN && (
                  <p className={`text-[11px] font-bold ${muted}`}>
                    Admin role receives full read &amp; write on every screen automatically.
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-red-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-red-700"
                >
                  {editingId ? "Save changes" : "Create user"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
