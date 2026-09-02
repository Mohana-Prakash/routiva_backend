import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/response';
import { trackingService } from './tracking.service';
import { toActivityLogDto } from './tracking.mapper';
import { todayInTimezone } from '../../common/utils/time';
import type { CompleteLogInput, CorrectLogInput, ListLogsQuery } from './tracking.validation';

export const trackingController = {
  async list(req: Request, res: Response) {
    const { items, meta } = await trackingService.list(req.userId as string, req.query as unknown as ListLogsQuery);
    sendSuccess(res, {
      items: items.map(toActivityLogDto),
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      hasMore: meta.page < meta.totalPages,
    });
  },

  async get(req: Request, res: Response) {
    const log = await trackingService.getOwned(req.params.id as string, req.userId as string);
    sendSuccess(res, toActivityLogDto(log));
  },

  async start(req: Request, res: Response) {
    const log = await trackingService.start(req.params.id as string, req.userId as string);
    sendSuccess(res, toActivityLogDto(log));
  },

  async complete(req: Request, res: Response) {
    const log = await trackingService.complete(req.params.id as string, req.userId as string, req.body as CompleteLogInput);
    sendSuccess(res, toActivityLogDto(log));
  },

  async skip(req: Request, res: Response) {
    const log = await trackingService.skip(req.params.id as string, req.userId as string);
    sendSuccess(res, toActivityLogDto(log));
  },

  async markMissed(req: Request, res: Response) {
    const log = await trackingService.markMissed(req.params.id as string, req.userId as string);
    sendSuccess(res, toActivityLogDto(log));
  },

  async correct(req: Request, res: Response) {
    const log = await trackingService.correct(req.params.id as string, req.userId as string, req.body as CorrectLogInput);
    sendSuccess(res, toActivityLogDto(log));
  },

  async dailySummary(req: Request, res: Response) {
    const date = (req.query.date as string | undefined) ?? todayInTimezone(req.userTimezone as string);
    const summary = await trackingService.dailySummary(req.userId as string, date);
    sendSuccess(res, summary);
  },
};
