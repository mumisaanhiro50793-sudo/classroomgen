import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { roleCookieName, sessionCookieName, studentCookieName, verifyPassword } from '@/lib/auth';

const bodySchema = z.object({
  username: z.string().min(3, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { username, password } = bodySchema.parse(json);

    const activeSession = await prisma.session.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!activeSession) {
      return NextResponse.json({ message: 'No active classroom session. Please ask your teacher to begin one.' }, { status: 404 });
    }

    const student = await prisma.student.findFirst({
      where: {
        username,
        sessionId: activeSession.id,
      },
      select: {
        id: true,
        passwordHash: true,
        username: true,
      },
    });

    if (!student) {
      return NextResponse.json({ message: 'Account not found for this session.' }, { status: 404 });
    }

    const isValid = await verifyPassword(password, student.passwordHash);
    if (!isValid) {
      return NextResponse.json({ message: 'Incorrect password. Please try again.' }, { status: 401 });
    }

    const response = NextResponse.json({
      sessionId: activeSession.id,
      role: 'student',
      student: {
        id: student.id,
        username: student.username,
      },
    });

    response.cookies.set(sessionCookieName, activeSession.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });
    response.cookies.set(roleCookieName, 'student', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });
    response.cookies.set(studentCookieName, student.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });

    return response;
  } catch (error) {
    console.error('Student login failed', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Unable to log in' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(sessionCookieName);
  response.cookies.delete(roleCookieName);
  response.cookies.delete(studentCookieName);
  return response;
}
