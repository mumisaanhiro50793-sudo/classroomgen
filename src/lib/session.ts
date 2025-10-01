import { cookies } from 'next/headers';
import { SubmissionStatus } from '@prisma/client';
import { prisma } from './prisma';
import { roleCookieName, sessionCookieName, studentCookieName, UserRole } from './auth';

export async function getActiveSession() {
  return prisma.session.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function endExistingSessions() {
  await prisma.session.updateMany({
    where: { isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName)?.value;
  const role = cookieStore.get(roleCookieName)?.value as UserRole | undefined;
  const studentId = cookieStore.get(studentCookieName)?.value;
  return { sessionId, role, studentId };
}

export async function getSubmissionWithRemainingEdits(submissionId: string) {
  const submission = await prisma.promptSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission) {
    return null;
  }

  const rootId = submission.rootSubmissionId ?? submission.id;
  const chainCount = await prisma.promptSubmission.count({
    where: {
      OR: [
        { id: rootId },
        { rootSubmissionId: rootId },
      ],
      status: SubmissionStatus.SUCCESS,
    },
  });

  const remaining = Math.max(0, 3 - chainCount);

  return { submission, remaining };
}
