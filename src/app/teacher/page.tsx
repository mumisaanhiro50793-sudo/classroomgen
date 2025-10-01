'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface TeacherSessionState {
  id: string;
  createdAt: string;
  isActive: boolean;
}

interface ActivitySubmission {
  id: string;
  prompt: string;
  role: 'STUDENT' | 'TEACHER';
  createdAt: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  revisionIndex: number;
  parentSubmissionId: string | null;
  rootSubmissionId: string | null;
  imageData: string | null;
  imageMimeType: string | null;
  errorMessage: string | null;
  isShared: boolean;
  studentUsername: string | null;
}

interface ActivityApiSubmission extends Omit<ActivitySubmission, 'studentUsername'> {
  student: { username: string | null } | null;
}

interface ActivityResponse {
  session: TeacherSessionState;
  submissions: ActivityApiSubmission[];
}

interface GallerySubmission {
  id: string;
  prompt: string;
  createdAt: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  revisionIndex: number;
  imageData: string | null;
  imageMimeType: string | null;
  isShared: boolean;
  studentUsername: string | null;
}

type ImagesResponse = {
  submissions?: Array<GallerySubmission & { remainingEdits?: number; ownedByCurrentUser?: boolean }>;
};

interface TeacherChatMessage {
  id: string;
  content: string;
  sender: 'STUDENT' | 'AI';
  createdAt: string;
}

interface TeacherChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    username: string | null;
  } | null;
  messages: TeacherChatMessage[];
}

interface TeacherChatsResponse {
  threads?: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    student: {
      id: string;
      username: string | null;
    } | null;
    messages: Array<{
      id: string;
      content: string;
      sender: 'STUDENT' | 'AI';
      createdAt: string;
    }>;
  }>;
}

interface SessionResponse {
  session: {
    id: string;
    createdAt: string;
    role: 'student' | 'teacher' | undefined;
  } | null;
}

const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatTimestamp(iso: string) {
  try {
    return timestampFormatter.format(new Date(iso));
  } catch {
    return '';
  }
}

export default function TeacherDashboard() {
  const [session, setSession] = useState<SessionResponse['session']>(null);
  const [loading, setLoading] = useState(true);
  const [startPassword, setStartPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [teacherKey, setTeacherKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [activity, setActivity] = useState<ActivitySubmission[]>([]);
  const [gallery, setGallery] = useState<GallerySubmission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [credentialCount, setCredentialCount] = useState(10);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Array<{ username: string; password: string }>>([]);
  const [chats, setChats] = useState<TeacherChatThread[]>([]);
  const [expandedChats, setExpandedChats] = useState<string[]>([]);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      const data: SessionResponse = await res.json();
      setSession(data.session);
    } catch (error) {
      console.error('Failed to load session', error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    if (!session?.id) return;
    setRefreshing(true);
    try {
      const [activityRes, galleryRes, chatsRes] = await Promise.all([
        fetch('/api/teacher/activity', { credentials: 'include' }),
        fetch('/api/images', { credentials: 'include' }),
        fetch('/api/teacher/chats', { credentials: 'include' }),
      ]);

      if (activityRes.ok) {
        const activityData: ActivityResponse = await activityRes.json();
        setActivity(
          activityData.submissions.map(({ student, ...rest }) => ({
            ...rest,
            studentUsername: student?.username ?? null,
          })),
        );
      }

      if (galleryRes.ok) {
        const galleryData: ImagesResponse = await galleryRes.json();
        setGallery(
          (galleryData.submissions ?? []).map((entry) => ({
            id: entry.id,
            prompt: entry.prompt,
            createdAt: entry.createdAt,
            status: entry.status,
            revisionIndex: entry.revisionIndex,
            imageData: entry.imageData,
            imageMimeType: entry.imageMimeType,
            isShared: entry.isShared,
            studentUsername: entry.studentUsername ?? null,
          })),
        );
      }

      if (chatsRes.ok) {
        const chatData: TeacherChatsResponse = await chatsRes.json();
        const chatThreads: TeacherChatThread[] = (chatData.threads ?? []).map((thread) => ({
          id: thread.id,
          title: thread.title,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          student: thread.student ?? null,
          messages: (thread.messages ?? []).map((message) => ({
            id: message.id,
            content: message.content,
            sender: message.sender,
            createdAt: message.createdAt,
          })),
        }));
        setChats(chatThreads);
      }
    } catch (error) {
      console.error('Failed to load activity', error);
    } finally {
      setRefreshing(false);
    }
  }, [session?.id]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (session?.id && session.role === 'teacher') {
      void loadActivity();
    }
  }, [session?.id, session?.role, loadActivity]);

  const handleStartSession = useCallback(async () => {
    if (startPassword.trim().length < 4) {
      setFormError('Password should be at least 4 characters.');
      return;
    }
    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: startPassword.trim() }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to start session.' }));
        setFormError(error.message ?? 'Unable to start session.');
        return;
      }

      setStartPassword('');
      setCredentials([]);
      setChats([]);
      setExpandedChats([]);
      await loadSession();
      await loadActivity();
    } catch (error) {
      console.error('Failed to start session', error);
      setFormError('Something went wrong. Try again.');
    } finally {
      setFormLoading(false);
    }
  }, [startPassword, loadSession, loadActivity]);

  const handleJoinAsTeacher = useCallback(async () => {
    if (joinPassword.trim().length === 0) {
      setFormError('Enter the classroom password to continue.');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/session/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          password: joinPassword.trim(),
          role: 'teacher',
          teacherKey: teacherKey.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to join as teacher.' }));
        setFormError(error.message ?? 'Unable to join as teacher.');
        return;
      }

      setJoinPassword('');
      await loadSession();
      await loadActivity();
    } catch (error) {
      console.error('Failed to join as teacher', error);
      setFormError('Something went wrong while joining.');
    } finally {
      setFormLoading(false);
    }
  }, [joinPassword, teacherKey, loadSession, loadActivity]);

  const handleEndSession = useCallback(async () => {
    setFormLoading(true);
    try {
      await fetch('/api/session/end', {
        method: 'POST',
        credentials: 'include',
      });
      await loadSession();
      setCredentials([]);
      setActivity([]);
      setGallery([]);
      setChats([]);
      setExpandedChats([]);
    } catch (error) {
      console.error('Failed to end session', error);
    } finally {
      setFormLoading(false);
    }
  }, [loadSession]);

  const handleGenerateCredentials = useCallback(async () => {
    if (!session?.id) return;
    const safeCount = Math.min(50, Math.max(1, Math.floor(credentialCount)));
    setCredentialCount(safeCount);
    setCredentialLoading(true);
    setCredentialError(null);
    try {
      const res = await fetch('/api/teacher/students/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count: safeCount }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to generate credentials.' }));
        setCredentialError(error.message ?? 'Unable to generate credentials.');
        return;
      }

      const data = await res.json();
      setCredentials(data.credentials ?? []);
    } catch (error) {
      console.error('Failed to generate credentials', error);
      setCredentialError('Something went wrong while generating credentials.');
    } finally {
      setCredentialLoading(false);
    }
  }, [credentialCount, session?.id]);

  const handleDownloadCredentials = useCallback(() => {
    if (credentials.length === 0) return;
    const rows = [['Username', 'Password'], ...credentials.map(({ username, password }) => [username, password])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `student-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [credentials]);

  const toggleChatExpansion = useCallback((threadId: string) => {
    setExpandedChats((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId],
    );
  }, []);

  const promptsByRoot = useMemo(() => {
    const groups = new Map<string, ActivitySubmission[]>();
    for (const entry of activity) {
      const rootId = entry.rootSubmissionId ?? entry.id;
      const list = groups.get(rootId) ?? [];
      groups.set(rootId, [...list, entry]);
    }
    return Array.from(groups.values()).map((entries) =>
      entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    );
  }, [activity]);

  const chatsByStudent = useMemo(() => {
    const groups = new Map<string, { studentName: string; threads: TeacherChatThread[] }>();
    for (const thread of chats) {
      const key = thread.student?.id ?? 'unknown';
      const entry = groups.get(key) ?? {
        studentName: thread.student?.username ?? 'Unknown student',
        threads: [],
      };
      entry.threads.push(thread);
      groups.set(key, entry);
    }
    return Array.from(groups.values()).map((group) => ({
      studentName: group.studentName,
      threads: group.threads.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }));
  }, [chats]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        Loading teacher dashboard...
      </main>
    );
  }

  if (!session || session.role !== 'teacher') {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold">Teacher Control Center</h1>
            <p className="text-sm text-slate-300">
              Start a new class session or unlock the dashboard with the teacher password you choose each day.
            </p>
          </header>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="bg-white/10 backdrop-blur rounded-2xl p-6 space-y-4 border border-white/10">
              <h2 className="text-lg font-medium text-white">Start new session</h2>
              <p className="text-xs text-slate-300">This ends any active session and sets a fresh teacher password.</p>
              <input
                type="password"
                value={startPassword}
                onChange={(event) => setStartPassword(event.target.value)}
                placeholder="New classroom password"
                className="w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                onClick={() => void handleStartSession()}
                disabled={formLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2 rounded-lg transition"
              >
                {formLoading ? 'Working...' : 'Start session'}
              </button>
            </section>
            <section className="bg-white/10 backdrop-blur rounded-2xl p-6 space-y-4 border border-white/10">
              <h2 className="text-lg font-medium text-white">Access active session</h2>
              <input
                type="password"
                value={joinPassword}
                onChange={(event) => setJoinPassword(event.target.value)}
                placeholder="Classroom password"
                className="w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <input
                type="text"
                value={teacherKey}
                onChange={(event) => setTeacherKey(event.target.value)}
                placeholder="Optional teacher key"
                className="w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <button
                onClick={() => void handleJoinAsTeacher()}
                disabled={formLoading}
                className="w-full bg-sky-500 hover:bg-sky-400 text-slate-900 font-semibold py-2 rounded-lg transition"
              >
                {formLoading ? 'Verifying...' : 'Open dashboard'}
              </button>
            </section>
          </div>
          {formError ? <p className="text-sm text-rose-300">{formError}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Teacher Dashboard</h1>
            <p className="text-sm text-slate-300">
              Monitor prompts, review generated images, and export today&apos;s class session.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => void loadActivity()}
              className="text-sm bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg"
            >
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
            <button
              onClick={() => {
                window.open('/api/teacher/export', '_blank');
              }}
              className="text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-4 py-2 rounded-lg"
            >
              Export session JSON
            </button>
            <button
              onClick={() => void handleEndSession()}
              className="text-sm bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg"
            >
              End session
            </button>
          </div>
        </header>

        <section className="bg-slate-900/60 rounded-2xl border border-white/10 p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs text-slate-400">Session ID</p>
              <p className="font-mono text-slate-200 text-sm">{session.id}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Started</p>
              <p className="text-sm text-slate-200">{formatTimestamp(session.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Total submissions</p>
              <p className="text-sm text-slate-200">{activity.length}</p>
            </div>
          </div>
        </section>

        <section className="bg-slate-900/60 rounded-2xl border border-white/10 p-6 space-y-6">
          <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Generate student credentials</h2>
              <p className="text-xs text-slate-400">Create quick sign-ins for today&apos;s class. Each username and password is eight characters.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400" htmlFor="credential-count">
                Number of students
              </label>
              <input
                id="credential-count"
                type="number"
                min={1}
                max={50}
                value={credentialCount}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setCredentialCount(Number.isNaN(value) ? 0 : value);
                }}
                className="w-20 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                onClick={() => void handleGenerateCredentials()}
                disabled={credentialLoading}
                className="text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-4 py-2 rounded-lg disabled:bg-slate-700 disabled:text-slate-400"
              >
                {credentialLoading ? 'Generating...' : 'Create logins'}
              </button>
            </div>
          </header>
          {credentialError ? (
            <div className="rounded-lg border border-rose-400 bg-rose-500/20 px-4 py-3 text-sm text-rose-100">
              {credentialError}
            </div>
          ) : null}
          {credentials.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <p className="text-xs text-slate-300">Share each row with a student. Passwords are only shown here once.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleDownloadCredentials()}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-md"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={() => void window.print()}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-md"
                  >
                    Print page
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-slate-200">#</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-200">Username</th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-200">Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((credential, index) => (
                      <tr key={credential.username} className={index % 2 === 0 ? 'bg-white/0' : 'bg-white/5'}>
                        <td className="px-4 py-2 text-slate-300">{index + 1}</td>
                        <td className="px-4 py-2 font-mono text-slate-100">{credential.username}</td>
                        <td className="px-4 py-2 font-mono text-slate-100">{credential.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No login cards generated yet.</p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Prompt timeline</h2>
          {promptsByRoot.length === 0 ? (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 text-slate-400 text-sm">
              No prompts yet. Students can join with the classroom password to begin.
            </div>
          ) : (
            <div className="space-y-4">
              {promptsByRoot.map((entries) => (
                <article key={entries[0]?.id} className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
                  <header className="space-y-1">
                    <p className="text-sm text-slate-300">Started {formatTimestamp(entries[0]?.createdAt ?? '')}</p>
                    <p className="text-lg font-medium text-slate-100">{entries[0]?.prompt}</p>
                  </header>
                  <ol className="space-y-3">
                    {entries.map((entry) => (
                      <li key={entry.id} className="border border-white/5 rounded-xl px-4 py-3">
                        <div className="flex flex-wrap justify-between gap-3 text-xs text-slate-300">
                          <span>{formatTimestamp(entry.createdAt)}</span>
                          <span>Revision {entry.revisionIndex}</span>
                          <span>Status: {entry.status}</span>
                          {entry.errorMessage ? <span className="text-rose-300">{entry.errorMessage}</span> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-[0.7rem] uppercase tracking-wide text-slate-500">
                          <span>Owner: {entry.studentUsername ?? (entry.role === 'TEACHER' ? 'Teacher' : 'Unassigned')}</span>
                          <span>{entry.isShared ? 'Shared with class' : 'Private'}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-100">{entry.prompt}</p>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Chat conversations</h2>
          {chatsByStudent.length === 0 ? (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 text-slate-400 text-sm">
              No student chats have been started yet.
            </div>
          ) : (
            <div className="space-y-4">
              {chatsByStudent.map((group) => (
                <article key={group.studentName} className="bg-slate-900/60 border border-white/10 rounded-2xl">
                  <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-100">{group.studentName}</h3>
                      <p className="text-xs text-slate-400">{group.threads.length} conversation{group.threads.length === 1 ? '' : 's'}</p>
                    </div>
                  </header>
                  <div className="divide-y divide-white/10">
                    {group.threads.map((thread) => {
                      const isExpanded = expandedChats.includes(thread.id);
                      const lastMessage = thread.messages[thread.messages.length - 1];
                      return (
                        <div key={thread.id} className="px-6 py-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{thread.title}</p>
                              <p className="text-xs text-slate-400">
                                Updated {formatTimestamp(thread.updatedAt)} · {thread.messages.length} messages
                              </p>
                            </div>
                            <button
                              onClick={() => toggleChatExpansion(thread.id)}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-md"
                            >
                              {isExpanded ? 'Collapse' : 'View conversation'}
                            </button>
                          </div>
                          <p className="text-sm text-slate-300 line-clamp-2">
                            {lastMessage ? `${lastMessage.sender === 'STUDENT' ? 'Student' : 'AI'}: ${lastMessage.content}` : 'No messages yet'}
                          </p>
                          {isExpanded ? (
                            <div className="space-y-3 border border-white/10 rounded-xl bg-slate-900/40 p-4">
                              {thread.messages.length === 0 ? (
                                <p className="text-xs text-slate-400">No messages in this conversation.</p>
                              ) : (
                                thread.messages.map((message) => (
                                  <div key={message.id} className="space-y-1">
                                    <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-slate-500">
                                      <span>{message.sender === 'STUDENT' ? 'Student' : 'AI Assistant'}</span>
                                      <span>{formatTimestamp(message.createdAt)}</span>
                                    </div>
                                    <p className="text-sm text-slate-100 whitespace-pre-wrap bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                                      {message.content}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Generated images</h2>
          {gallery.length === 0 ? (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 text-slate-400 text-sm">
              Images will appear here as students complete generations.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {gallery
                .filter((entry) => entry.status === 'SUCCESS' && entry.imageData)
                .map((entry) => (
                  <figure key={entry.id} className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="relative w-full aspect-[4/3]">
                      <Image
                        src={`data:${entry.imageMimeType ?? 'image/png'};base64,${entry.imageData}`}
                        alt={entry.prompt}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <figcaption className="p-4 space-y-2">
                      <p className="text-sm text-slate-100">{entry.prompt}</p>
                      <p className="text-xs text-slate-400 flex flex-wrap gap-3">
                        <span>{formatTimestamp(entry.createdAt)}</span>
                        <span>Revision {entry.revisionIndex}</span>
                      </p>
                      <p className="text-xs text-slate-400 flex flex-wrap gap-3">
                        <span>Owner: {entry.studentUsername ?? 'Unknown'}</span>
                        <span>{entry.isShared ? 'Shared' : 'Private'}</span>
                      </p>
                    </figcaption>
                  </figure>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
