import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, roleCookieName, sessionCookieName, studentCookieName } from '@/lib/auth';

const bodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['student', 'teacher']).default('student'),
  teacherKey: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { password, role, teacherKey } = bodySchema.parse(json);

    const activeSession = await prisma.session.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSession) {
      return NextResponse.json({ message: 'No active session. Please ask the teacher to start one.' }, { status: 404 });
    }

    const isValid = await verifyPassword(password, activeSession.passwordHash);
    if (!isValid) {
      return NextResponse.json({ message: 'Incorrect password. Try again.' }, { status: 401 });
    }

    if (role === 'teacher') {
      const requiredKey = process.env.TEACHER_DASHBOARD_KEY?.trim();
      if (requiredKey) {
        if (!teacherKey || teacherKey !== requiredKey) {
          return NextResponse.json({ message: 'Teacher dashboard key is invalid.' }, { status: 403 });
        }
      }
    }

    const response = NextResponse.json({
      sessionId: activeSession.id,
      role,
      createdAt: activeSession.createdAt,
    });
    response.cookies.set(sessionCookieName, activeSession.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });
    response.cookies.set(roleCookieName, role, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });
    if (role === 'teacher') {
      response.cookies.delete(studentCookieName);
    }

    return response;
  } catch (error) {
    console.error('Failed to join session', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Unable to join session' }, { status: 500 });
  }
}
