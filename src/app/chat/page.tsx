'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StudentNav } from '@/components/student/StudentNav';

interface SessionState {
  id: string;
  createdAt: string;
  role: 'student' | 'teacher' | undefined;
  student?: {
    id: string;
    username: string;
  } | null;
}

interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  latestMessage: string | null;
  messageCount: number;
}

interface Message {
  id: string;
  content: string;
  sender: 'STUDENT' | 'AI';
  createdAt: string;
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatTime(iso: string) {
  try {
    return timeFormatter.format(new Date(iso));
  } catch {
    return '';
  }
}

export default function StudentChatPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadLimit, setThreadLimit] = useState(5);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      if (!res.ok) {
        setSession(null);
        return;
      }
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
      } else {
        setSession(null);
      }
    } catch (error) {
      console.error('Failed to load session', error);
      setSession(null);
    } finally {
      setInitializing(false);
    }
  }, []);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadError(null);
    try {
      const res = await fetch('/api/chat/threads', { credentials: 'include' });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to load conversations.' }));
        setThreadError(error.message ?? 'Unable to load conversations.');
        return;
      }
      const data = await res.json();
      const threadList: ThreadSummary[] = data.threads ?? [];
      setThreads(threadList);
      setThreadLimit(data.limit ?? 5);
      if (
        threadList.length > 0 &&
        (!selectedThreadId || !threadList.some((thread) => thread.id === selectedThreadId))
      ) {
        setSelectedThreadId(threadList[0].id);
      }
    } catch (error) {
      console.error('Failed to load threads', error);
      setThreadError('Something went wrong while loading conversations.');
    } finally {
      setThreadsLoading(false);
    }
  }, [selectedThreadId]);

  const loadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true);
    setMessageError(null);
    try {
      const res = await fetch(`/api/chat/threads/${threadId}/messages`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to load messages.' }));
        setMessageError(error.message ?? 'Unable to load messages.');
        return;
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch (error) {
      console.error('Failed to load messages', error);
      setMessageError('Something went wrong while loading messages.');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (session?.id && session.role === 'student') {
      void loadThreads();
    }
  }, [session?.id, session?.role, loadThreads]);

  useEffect(() => {
    if (selectedThreadId) {
      void loadMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId, loadMessages]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  const handleLogin = useCallback(async () => {
    setLoggingIn(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to log in.' }));
        setAuthError(error.message ?? 'Unable to log in.');
        return;
      }

      setPassword('');
      await loadSession();
    } catch (error) {
      console.error('Failed to log in', error);
      setAuthError('Something went wrong. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  }, [username, password, loadSession]);

  const handleCreateThread = useCallback(async () => {
    setThreadError(null);
    try {
      const res = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to create chat.' }));
        setThreadError(error.message ?? 'Unable to create chat.');
        return;
      }

      const data = await res.json();
      const newThread = data.thread as ThreadSummary;
      setThreads((prev) => [newThread, ...prev.filter((thread) => thread.id !== newThread.id)]);
      setThreadLimit(data.limit ?? 5);
      setSelectedThreadId(newThread.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create chat thread', error);
      setThreadError('Something went wrong while creating the chat.');
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!selectedThreadId || messageInput.trim().length === 0) {
      return;
    }

    const content = messageInput.trim();
    setSending(true);
    setMessageError(null);
    try {
      const res = await fetch(`/api/chat/threads/${selectedThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unable to send message.' }));
        setMessageError(error.message ?? 'Unable to send message.');
        return;
      }

      const data = await res.json();
      const newMessages: Message[] = data.messages ?? [];
      setMessages((prev) => [...prev, ...newMessages]);
      setMessageInput('');
      setThreads((prev) =>
        prev
          .map((thread) =>
            thread.id === selectedThreadId
              ? {
                  ...thread,
                  updatedAt: newMessages[newMessages.length - 1]?.createdAt ?? thread.updatedAt,
                  latestMessage: newMessages[newMessages.length - 1]?.content ?? thread.latestMessage,
                  messageCount: thread.messageCount + newMessages.length,
                }
              : thread,
          )
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      );
    } catch (error) {
      console.error('Failed to send chat message', error);
      setMessageError('Something went wrong while sending your message.');
    } finally {
      setSending(false);
    }
  }, [messageInput, selectedThreadId]);

  const threadUsage = useMemo(() => `${threads.length}/${threadLimit} chats used`, [threads.length, threadLimit]);

  if (initializing) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Loading chat assistant...
      </main>
    );
  }

  if (!session || session.role !== 'student') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e0f2fe] to-[#fafafa] p-6">
        <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-8 space-y-6 border border-sky-100">
          <header className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-sky-900">Student Sign In</h1>
            <p className="text-sm text-slate-600">Enter the username and password your teacher provided.</p>
          </header>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="student-username">
                Username
              </label>
              <input
                id="student-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Example: SkyBlue42"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="student-password">
                Password
              </label>
              <input
                id="student-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400"
              />
            </div>
            {authError ? <p className="text-sm text-rose-600">{authError}</p> : null}
          </div>
          <button
            onClick={() => void handleLogin()}
            disabled={loggingIn || username.trim().length === 0 || password.trim().length === 0}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-medium py-3 rounded-lg transition"
          >
            {loggingIn ? 'Signing in...' : 'Enter classroom'}
          </button>
        </div>
      </main>
    );
  }

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <StudentNav />
            <div>
              <h1 className="text-3xl font-semibold text-sky-900">Classroom Chat Assistant</h1>
              <p className="text-sm text-slate-600">Ask questions, brainstorm ideas, and get help from the AI assistant.</p>
            </div>
          </div>
          <div className="text-sm text-slate-500 text-right space-y-1">
            <p>
              Signed in as{' '}
              <span className="font-medium text-slate-700">{session.student?.username ?? 'Student'}</span>
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-400">{threadUsage}</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Your conversations</h2>
                <button
                  onClick={() => void handleCreateThread()}
                  disabled={threads.length >= threadLimit}
                  className="text-sm bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-medium px-4 py-2 rounded-lg transition"
                >
                  New chat
                </button>
              </div>
              <p className="text-xs text-slate-500">You can create up to {threadLimit} chats per class.</p>
              {threadError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {threadError}
                </div>
              ) : null}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {threadsLoading ? (
                  <p className="text-sm text-slate-500">Loading conversations...</p>
                ) : threads.length === 0 ? (
                  <p className="text-sm text-slate-500">No conversations yet. Start a chat to begin!</p>
                ) : (
                  threads.map((thread) => {
                    const isActive = thread.id === selectedThreadId;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => {
                          setSelectedThreadId(thread.id);
                        }}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                          isActive
                            ? 'border-sky-300 bg-sky-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-800 line-clamp-1">{thread.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {thread.latestMessage ?? 'No messages yet'}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                          <span>{formatTime(thread.updatedAt)}</span>
                          <span>{thread.messageCount} messages</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl shadow-lg p-0 flex flex-col h-[640px]">
            {selectedThread ? (
              <>
                <header className="border-b border-slate-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-slate-800">{selectedThread.title}</h2>
                  <p className="text-xs text-slate-500">Started {formatTime(selectedThread.createdAt)}</p>
                </header>
                <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-slate-50">
                  {messagesLoading ? (
                    <p className="text-sm text-slate-500">Loading messages...</p>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-500">
                      Send a message to start the conversation.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isStudent = message.sender === 'STUDENT';
                      return (
                        <div key={message.id} className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                              isStudent ? 'bg-sky-600 text-white' : 'bg-white text-slate-800'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            <span className={`mt-2 block text-xs ${isStudent ? 'text-sky-100/80' : 'text-slate-400'}`}>
                              {formatTime(message.createdAt)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
                <footer className="border-t border-slate-200 px-6 py-4 space-y-3 bg-white">
                  {messageError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {messageError}
                    </div>
                  ) : null}
                  <textarea
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Ask a question or describe what you need help with..."
                    className="w-full min-h-24 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Press Enter to send. Shift + Enter for a new line.</p>
                    <button
                      onClick={() => void handleSendMessage()}
                      disabled={sending || messageInput.trim().length === 0}
                      className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-medium px-5 py-2.5 rounded-lg transition"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-slate-500">
                <p className="text-lg font-medium text-slate-700">Select or create a chat to get started</p>
                <p className="text-sm">Use the panel on the left to choose a conversation or start a new one.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
