import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { schedulesService } from './schedules.service';
import { todayInTimezone } from '../../common/utils/time';
import type {
  CreateExceptionInput,
  CreateScheduleEntryInput,
  UpdateExceptionInput,
  UpdateScheduleEntryInput,
} from './schedules.validation';

export const schedulesController = {
  async list(req: Request, res: Response) {
    const includeInactive = (req.query as { includeInactive?: boolean }).includeInactive ?? false;
    const entries = await schedulesService.listEntries(req.userId as string, includeInactive);
    sendSuccess(res, { entries });
  },

  async get(req: Request, res: Response) {
    const entry = await schedulesService.getEntryOwned(req.params.id as string, req.userId as string);
    sendSuccess(res, { entry });
  },

  async create(req: Request, res: Response) {
    const entry = await schedulesService.createEntry(req.userId as string, req.userTimezone as string, req.body as CreateScheduleEntryInput);
    sendCreated(res, { entry });
  },

  async update(req: Request, res: Response) {
    const entry = await schedulesService.updateEntry(
      req.params.id as string,
      req.userId as string,
      req.userTimezone as string,
      req.body as UpdateScheduleEntryInput,
    );
    sendSuccess(res, { entry });
  },

  async remove(req: Request, res: Response) {
    const entry = await schedulesService.archiveEntry(req.params.id as string, req.userId as string, req.userTimezone as string);
    sendSuccess(res, { entry });
  },

  async renderForDate(req: Request, res: Response) {
    const timeline = await schedulesService.renderAndMaterializeDate(
      req.userId as string,
      req.params.date as string,
      req.userTimezone as string,
    );
    sendSuccess(res, { date: req.params.date, timeline });
  },

  async today(req: Request, res: Response) {
    const date = todayInTimezone(req.userTimezone as string);
    const timeline = await schedulesService.renderAndMaterializeDate(req.userId as string, date, req.userTimezone as string);
    sendSuccess(res, { date, timeline });
  },

  async createException(req: Request, res: Response) {
    const exception = await schedulesService.createException(req.userId as string, req.userTimezone as string, req.body as CreateExceptionInput);
    sendCreated(res, { exception });
  },

  async updateException(req: Request, res: Response) {
    const exception = await schedulesService.updateException(
      req.params.id as string,
      req.userId as string,
      req.userTimezone as string,
      req.body as UpdateExceptionInput,
    );
    sendSuccess(res, { exception });
  },

  async deleteException(req: Request, res: Response) {
    await schedulesService.deleteException(req.params.id as string, req.userId as string, req.userTimezone as string);
    res.status(204).send();
  },
};
