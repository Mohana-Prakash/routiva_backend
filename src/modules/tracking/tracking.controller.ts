import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/response';
import { trackingService } from './tracking.service';
import { todayInTimezone } from '../../common/utils/time';
import type { CorrectLogInput, ListLogsQuery } from './tracking.validation';

export const trackingController = {
  async list(req: Request, res: Response) {
    const { items, meta } = await trackingService.list(req.userId as string, req.query as unknown as ListLogsQuery);
    sendSuccess(res, { logs: items }, 200, meta);
  },

  async get(req: Request, res: Response) {
    const log = await trackingService.getOwned(req.params.id as string, req.userId as string);
    sendSuccess(res, { log });
  },

  async start(req: Request, res: Response) {
    const log = await trackingService.start(req.params.id as string, req.userId as string);
    sendSuccess(res, { log });
  },

  async complete(req: Request, res: Response) {
    const log = await trackingService.complete(req.params.id as string, req.userId as string);
    sendSuccess(res, { log });
  },

  async skip(req: Request, res: Response) {
    const log = await trackingService.skip(req.params.id as string, req.userId as string);
    sendSuccess(res, { log });
  },

  async correct(req: Request, res: Response) {
    const log = await trackingService.correct(req.params.id as string, req.userId as string, req.body as CorrectLogInput);
    sendSuccess(res, { log });
  },

  async dailySummary(req: Request, res: Response) {
    const date = (req.query.date as string | undefined) ?? todayInTimezone(req.userTimezone as string);
    const summary = await trackingService.dailySummary(req.userId as string, date);
    sendSuccess(res, { summary });
  },
};
