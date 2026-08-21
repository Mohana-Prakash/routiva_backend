import { prisma } from '../../db/prisma';
import { AppError } from '../../common/errors/AppError';
import type { UpdateProfileInput } from './users.validation';

function toPublicUser(user: { id: string; name: string; email: string; timezone: string; status: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const usersService = {
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');
    return toPublicUser(user);
  },

  async updateMe(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({ where: { id: userId }, data: input });
    return toPublicUser(user);
  },
};
