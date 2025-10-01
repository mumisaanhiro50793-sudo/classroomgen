import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashPassword, roleCookieName, sessionCookieName, studentCookieName } from '@/lib/auth';
import { endExistingSessions } from '@/lib/session';
import { prisma } from '@/lib/prisma';

const bodySchema = z.object({
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { password } = bodySchema.parse(json);

    await endExistingSessions();

    const passwordHash = await hashPassword(password);
    const session = await prisma.session.create({
      data: {
        passwordHash,
        isActive: true,
      },
    });

    const response = NextResponse.json({
      sessionId: session.id,
      createdAt: session.createdAt,
    });
    response.cookies.set(sessionCookieName, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });
    response.cookies.set(roleCookieName, 'teacher', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 6,
    });
    response.cookies.delete(studentCookieName);

    return response;
  } catch (error) {
    console.error('Failed to start session', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Unable to start session' }, { status: 500 });
  }
}
