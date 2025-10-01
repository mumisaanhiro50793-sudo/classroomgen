import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionFromCookies } from '@/lib/session';
import { Prisma } from '@prisma/client';

export async function GET() {
  const { sessionId, role, studentId } = await getSessionFromCookies();

  if (!sessionId) {
    return NextResponse.json({ submissions: [] });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId, isActive: true },
  });

  if (!session) {
    return NextResponse.json({ submissions: [] });
  }

  const where: Prisma.PromptSubmissionWhereInput = { sessionId };
  if (role !== 'teacher') {
    where.status = 'SUCCESS';
    where.OR = [
      { isShared: true },
      studentId ? { studentId } : undefined,
    ].filter(Boolean) as Prisma.PromptSubmissionWhereInput[];
  }

  const submissions = await prisma.promptSubmission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      prompt: true,
      createdAt: true,
      status: true,
      imageData: true,
      imageMimeType: true,
      revisionIndex: true,
      rootSubmissionId: true,
      parentSubmissionId: true,
      errorMessage: true,
      studentId: true,
      isShared: true,
      student: {
        select: {
          username: true,
        },
      },
    },
  });

  const successCounts = new Map<string, number>();
  for (const submission of submissions) {
    if (submission.status !== 'SUCCESS') continue;
    const rootId = submission.rootSubmissionId ?? submission.id;
    successCounts.set(rootId, (successCounts.get(rootId) ?? 0) + 1);
  }

  const enriched = submissions.map((submission) => {
    const rootId = submission.rootSubmissionId ?? submission.id;
    const successCount = successCounts.get(rootId) ?? (submission.status === 'SUCCESS' ? 1 : 0);
    const remainingEdits = Math.max(0, 3 - successCount);
    return {
      ...submission,
      rootId,
      remainingEdits,
      isShared: submission.isShared,
      ownedByCurrentUser: studentId ? submission.studentId === studentId : false,
      studentUsername: submission.student?.username ?? null,
    };
  });

  return NextResponse.json({ submissions: enriched, role });
}
