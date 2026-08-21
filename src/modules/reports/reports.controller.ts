import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/response';
import { reportsService } from './reports.service';
import type { ReportRangeQuery } from './reports.validation';

export const reportsController = {
  async summary(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const summary = await reportsService.summary(req.userId as string, from, to);
    sendSuccess(res, { summary });
  },

  async categories(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const categories = await reportsService.categories(req.userId as string, from, to);
    sendSuccess(res, { categories });
  },

  async activities(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const activities = await reportsService.activities(req.userId as string, from, to);
    sendSuccess(res, { activities });
  },

  async dailyTrend(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const trend = await reportsService.dailyTrend(req.userId as string, from, to);
    sendSuccess(res, { trend });
  },
};
