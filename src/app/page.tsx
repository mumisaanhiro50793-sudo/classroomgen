'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface Submission {
  id: string;
  prompt: string;
  createdAt: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  imageData: string | null;
  imageMimeType: string | null;
  revisionIndex: number;
  rootSubmissionId: string | null;
  parentSubmissionId: string | null;
  remainingEdits: number;
  errorMessage: string | null;
  isShared: boolean;
  ownedByCurrentUser: boolean;
  studentUsername: string | null;
}

interface FetchSubmissionsResponse {
  submissions: Submission[];
  role?: 'student' | 'teacher';
}

const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

function toDisplayTime(iso: string) {
  try {
    return timestampFormatter.format(new Date(iso));
  } catch {
    return '';
  }
}

function downloadImage(submission: Submission) {
  if (!submission.imageData) return;
  const mimeType = submission.imageMimeType || 'image/png';
  const prefix = mimeType.split('/')[1] || 'png';
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${submission.imageData}`;
  const revisionLabel = submission.revisionIndex > 0 ? `-rev${submission.revisionIndex}` : '';
  link.download = `classroom-image-${submission.id}${revisionLabel}.${prefix}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function StudentHome() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [fetchingSubmissions, setFetchingSubmissions] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [shareUpdatingId, setShareUpdatingId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

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

  const loadSubmissions = useCallback(async () => {
    if (!session?.id) return;
    setFetchingSubmissions(true);
    setShareError(null);
    try {
      const res = await fetch('/api/images', { credentials: 'include' });
      if (!res.ok) return;
      const data: FetchSubmissionsResponse = await res.json();
      setSubmissions(data.submissions ?? []);
    } catch (error) {
      console.error('Failed to load submissions', error);
    } finally {
      setFetchingSubmissions(false);
    }
  }, [session?.id]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (session?.id && session.role === 'student') {
      void loadSubmissions();
    }
  }, [session?.id, session?.role, loadSubmissions]);

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

  const handleGenerate = useCallback(
    async (parentSubmissionId?: string, promptOverride?: string) => {
      if (!promptOverride && !prompt.trim()) {
        setGenerateError('Please enter a prompt.');
        return;
      }

      const textPrompt = promptOverride ?? prompt;
      setGeneratingId(parentSubmissionId ?? 'new');
      setGenerateError(null);
      try {
        const res = await fetch('/api/images/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            prompt: textPrompt,
            parentSubmissionId,
          }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: 'Image generation failed.' }));
          setGenerateError(error.message ?? 'Image generation failed.');
          return;
        }

        setPrompt('');
        await loadSubmissions();
      } catch (error) {
        console.error('Image generation failed', error);
        setGenerateError('Something went wrong while generating the image.');
      } finally {
        setGeneratingId(null);
      }
    },
    [prompt, loadSubmissions],
  );

  const handleShareToggle = useCallback(
    async (submissionId: string, share: boolean) => {
      setShareUpdatingId(submissionId);
      setShareError(null);
      try {
        const res = await fetch('/api/images/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ submissionId, share }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: 'Unable to update sharing.' }));
          setShareError(error.message ?? 'Unable to update sharing.');
          return;
        }

        setSubmissions((prev) =>
          prev.map((item) =>
            item.id === submissionId ? { ...item, isShared: share } : item,
          ),
        );
      } catch (error) {
        console.error('Failed to update share state', error);
        setShareError('Something went wrong while updating sharing.');
      } finally {
        setShareUpdatingId(null);
      }
    },
    [],
  );

  const groupedSubmissions = useMemo(() => {
    const result = new Map<string, Submission[]>();
    for (const submission of submissions) {
      const rootId = submission.rootSubmissionId ?? submission.id;
      const current = result.get(rootId) ?? [];
      result.set(rootId, [...current, submission]);
    }

    return Array.from(result.entries()).map(([rootId, entries]) => ({
      rootId,
      submissions: entries.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    }));
  }, [submissions]);

  if (initializing) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-sky-50">
        <p className="text-sky-900 text-lg">Loading classroom session...</p>
      </main>
    );
  }

  if (!session || session.role !== 'student') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e0f2fe] to-[#fafafa] p-6">
        <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-8 space-y-6 border border-sky-100">
          <header className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold text-sky-900">Student Sign In</h1>
            <p className="text-sm text-slate-600">Enter the username and password your teacher provided for today&apos;s class.</p>
            {session?.role === 'teacher' ? (
              <p className="text-xs text-slate-500">Teacher access is available on the <a className="text-sky-600 underline" href="/teacher">dashboard</a>.</p>
            ) : null}
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

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <StudentNav />
            <div>
              <h1 className="text-3xl font-semibold text-sky-900">Classroom Image Lab</h1>
              <p className="text-sm text-slate-600">Create and refine AI-generated images with your classmates.</p>
            </div>
          </div>
          <div className="text-sm text-slate-500 text-right space-y-1">
            <p>
              Signed in as{' '}
              <span className="font-medium text-slate-700">
                {session.student?.username ?? 'Student'}
              </span>
            </p>
            <p>
              Session started at{' '}
              <span className="font-medium text-slate-700">{toDisplayTime(session.createdAt)}</span>
            </p>
          </div>
        </header>

        <section className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-slate-800">Create a new image</h2>
          <p className="text-sm text-slate-600">Describe what you want to see. Try adding colors, settings, and actions to get the best results.</p>
          <textarea
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (generateError) setGenerateError(null);
            }}
            placeholder="Example: A futuristic city skyline at sunset with flying cars"
            className="w-full min-h-28 rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400"
          />
          {generateError ? <p className="text-sm text-rose-600">{generateError}</p> : null}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <button
              onClick={() => void handleGenerate()}
              disabled={generatingId !== null || prompt.trim().length < 5}
              className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-medium px-5 py-3 rounded-lg transition"
            >
              {generatingId === 'new' ? 'Generating...' : 'Generate image'}
            </button>
            <button
              onClick={() => {
                setPrompt('');
                setGenerateError(null);
              }}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Clear prompt
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800">Classroom gallery</h2>
            <button
              onClick={() => void loadSubmissions()}
              className="text-sm text-sky-600 hover:text-sky-700"
            >
              {fetchingSubmissions ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {shareError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {shareError}
            </div>
          ) : null}
          {submissions.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
              No images yet. Be the first to create one!
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {groupedSubmissions.map(({ rootId, submissions: chain }) => {
                const first = chain[0];
                const chainShared = chain.some((entry) => entry.isShared);
                const ownedByMe = chain.some((entry) => entry.ownedByCurrentUser);
                const ownerLabel = ownedByMe ? 'You' : first?.studentUsername ?? 'Classmate';
                return (
                  <article key={rootId} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-5">
                    <header className="space-y-2">
                      <p className="text-sm text-slate-500">Started {toDisplayTime(first?.createdAt ?? '')}</p>
                      <p className="text-base font-medium text-slate-800">{first?.prompt}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                          Owner: {ownerLabel}
                        </span>
                        <span className={`rounded-full px-3 py-1 font-medium ${chainShared ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {chainShared ? 'Shared with class' : 'Private to you'}
                        </span>
                      </div>
                    </header>
                    <div className="space-y-6">
                      {chain.map((submission) => (
                        <div key={submission.id} className="space-y-3">
                        <div className="relative overflow-hidden rounded-xl border border-slate-200">
                          {submission.imageData ? (
                            <div className="relative aspect-[4/3] w-full">
                              <Image
                                src={`data:${submission.imageMimeType ?? 'image/png'};base64,${submission.imageData}`}
                                alt={submission.prompt}
                                fill
                                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                                unoptimized
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="h-64 flex items-center justify-center text-slate-500">
                              Image unavailable
                            </div>
                          )}
                          <div className="absolute top-3 right-3 text-xs bg-white/80 px-3 py-1 rounded-full text-slate-600">
                            {submission.revisionIndex === 0 ? 'Original' : `Refinement ${submission.revisionIndex}`}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-medium text-slate-500">
                            Created at {toDisplayTime(submission.createdAt)}
                          </span>
                          {submission.status === 'SUCCESS' ? (
                            <span className="text-xs font-semibold text-sky-700 bg-sky-100 px-3 py-1 rounded-full">
                              {submission.remainingEdits} refinements left
                            </span>
                          ) : null}
                          {submission.status === 'ERROR' ? (
                            <span className="text-xs font-semibold text-rose-700 bg-rose-100 px-3 py-1 rounded-full">
                              {submission.errorMessage ?? 'Generation failed'}
                            </span>
                          ) : null}
                          {submission.status === 'SUCCESS' && submission.isShared ? (
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                              Shared
                            </span>
                          ) : null}
                        </div>
                        {submission.status === 'SUCCESS' ? (
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={() => downloadImage(submission)}
                              className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
                            >
                              Download
                            </button>
                            {submission.ownedByCurrentUser ? (
                              <button
                                onClick={() => void handleShareToggle(submission.id, !submission.isShared)}
                                disabled={shareUpdatingId === submission.id}
                                className="text-sm font-medium rounded-lg px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:bg-slate-200 disabled:text-slate-500"
                              >
                                {shareUpdatingId === submission.id
                                  ? 'Saving...'
                                  : submission.isShared
                                    ? 'Unshare'
                                    : 'Share with class'}
                              </button>
                            ) : null}
                            {submission.ownedByCurrentUser && submission.remainingEdits > 0 ? (
                              <RefineButton
                                key={`${submission.id}-refine`}
                                submission={submission}
                                onRefine={handleGenerate}
                                disabled={generatingId !== null}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

interface RefineButtonProps {
  submission: Submission;
  onRefine: (parentSubmissionId: string, promptOverride: string) => Promise<void>;
  disabled: boolean;
}

function RefineButton({ submission, onRefine, disabled }: RefineButtonProps) {
  const [open, setOpen] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState(submission.prompt);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (refinePrompt.trim().length < 5) {
      setError('Please describe at least five characters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onRefine(submission.id, refinePrompt);
      setOpen(false);
    } catch (err) {
      console.error('Refine failed', err);
      setError('Unable to refine image.');
    } finally {
      setLoading(false);
    }
  }, [refinePrompt, onRefine, submission.id]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 rounded-lg px-3 py-2 transition"
      >
        Refine image
      </button>
    );
  }

  return (
    <div className="w-full border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50">
      <textarea
        value={refinePrompt}
        onChange={(event) => {
          setRefinePrompt(event.target.value);
          if (error) setError(null);
        }}
        className="w-full min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleSubmit()}
          disabled={disabled || loading}
          className="text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 rounded-lg px-3 py-2 transition"
        >
          {loading ? 'Refining...' : 'Submit refinement'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
