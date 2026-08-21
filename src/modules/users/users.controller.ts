import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/response';
import { usersService } from './users.service';
import type { UpdateProfileInput } from './users.validation';

export const usersController = {
  async getMe(req: Request, res: Response) {
    const user = await usersService.getMe(req.userId as string);
    sendSuccess(res, { user });
  },

  async updateMe(req: Request, res: Response) {
    const user = await usersService.updateMe(req.userId as string, req.body as UpdateProfileInput);
    sendSuccess(res, { user });
  },
};
