import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionFromCookies } from '@/lib/session';

const messageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(4000, 'Message is too long'),
});

const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_HISTORY_MESSAGES = 20;

function toOpenRouterMessages(history: Array<{ sender: 'STUDENT' | 'AI'; content: string }>) {
  return history.map((entry) => ({
    role: entry.sender === 'STUDENT' ? 'user' : 'assistant',
    content: entry.content,
  }));
}

function extractTextFromChoiceMessage(message: unknown) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  // @ts-expect-error -- dynamic structure from OpenRouter
  const content = message.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        if (typeof part.value === 'string') return part.value;
        return '';
      })
      .join(' ')
      .trim();
    return text.length > 0 ? text : null;
  }
  // Some providers return { text: "..." }
  // @ts-expect-error dynamic property access
  if (typeof message.text === 'string') {
    // @ts-expect-error dynamic property access
    return message.text.trim();
  }

  return null;
}

async function callChatCompletion(history: Array<{ sender: 'STUDENT' | 'AI'; content: string }>) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OpenRouter API key. Set OPENROUTER_API_KEY in your environment.');
  }

  const model = process.env.OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-preview-09-2025';

  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'Classroom Assistant Chat',
    },
    body: JSON.stringify({
      model,
      messages: toOpenRouterMessages(history),
      modality: 'text',
      modalities: ['text'],
      top_p: 0.9,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('OpenRouter chat completion error', result);
    const message = result?.error?.message ?? 'OpenRouter request failed';
    throw new Error(message);
  }

  const choice = result?.choices?.[0]?.message;
  const aiText = extractTextFromChoiceMessage(choice);
  if (!aiText || aiText.length === 0) {
    throw new Error('OpenRouter returned an empty response');
  }

  return aiText;
}

export async function GET(_: Request, context: unknown) {
  const extracted = context as { params: { threadId: string } | Promise<{ threadId: string }> };
  const resolvedParams = await Promise.resolve(extracted.params);
  const { threadId } = resolvedParams;
  const { sessionId, role, studentId } = await getSessionFromCookies();

  if (!sessionId || role !== 'student' || !studentId) {
    return NextResponse.json({ message: 'Student access required.' }, { status: 403 });
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      sessionId: true,
      studentId: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          content: true,
          sender: true,
          createdAt: true,
        },
      },
    },
  });

  if (!thread || thread.sessionId !== sessionId || thread.studentId !== studentId) {
    return NextResponse.json({ message: 'Chat not found.' }, { status: 404 });
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
    messages: thread.messages.map((message) => ({
      id: message.id,
      content: message.content,
      sender: message.sender,
      createdAt: message.createdAt,
    })),
  });
}

export async function POST(request: Request, context: unknown) {
  const extracted = context as { params: { threadId: string } | Promise<{ threadId: string }> };
  const resolvedParams = await Promise.resolve(extracted.params);
  const { threadId } = resolvedParams;

  try {
    const { sessionId, role, studentId } = await getSessionFromCookies();

    if (!sessionId || role !== 'student' || !studentId) {
      return NextResponse.json({ message: 'Student access required.' }, { status: 403 });
    }

    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
      select: { id: true, sessionId: true, studentId: true },
    });

    if (!thread || thread.sessionId !== sessionId || thread.studentId !== studentId) {
      return NextResponse.json({ message: 'Chat not found.' }, { status: 404 });
    }

    const json = await request.json();
    const { content } = messageSchema.parse(json);

    const studentMessage = await prisma.chatMessage.create({
      data: {
        content,
        sender: 'STUDENT',
        threadId,
        studentId,
      },
    });

    const history = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
    });

    const orderedHistory = history.reverse();

    const aiResponseText = await callChatCompletion(orderedHistory.map((message) => ({
      sender: message.sender,
      content: message.content,
    })));

    const aiMessage = await prisma.chatMessage.create({
      data: {
        content: aiResponseText,
        sender: 'AI',
        threadId,
      },
    });

    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      messages: [studentMessage, aiMessage].map((message) => ({
        id: message.id,
        content: message.content,
        sender: message.sender,
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to send chat message', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unable to send message';
    return NextResponse.json({ message }, { status: 500 });
  }
}
