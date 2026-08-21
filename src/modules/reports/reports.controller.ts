import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/response';
import { reportsService } from './reports.service';
import { toActivityReportDto, toCategoryReportDto, toDailyTrendPointDto, toReportSummaryDto } from './reports.mapper';
import type { ReportRangeQuery } from './reports.validation';

export const reportsController = {
  async summary(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const summary = await reportsService.summary(req.userId as string, from, to);
    sendSuccess(res, toReportSummaryDto(summary));
  },

  async categories(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const categories = await reportsService.categories(req.userId as string, from, to);
    sendSuccess(res, categories.map(toCategoryReportDto));
  },

  async activities(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const activities = await reportsService.activities(req.userId as string, from, to);
    sendSuccess(res, activities.map(toActivityReportDto));
  },

  async dailyTrend(req: Request, res: Response) {
    const { from, to } = req.query as unknown as ReportRangeQuery;
    const trend = await reportsService.dailyTrend(req.userId as string, from, to);
    sendSuccess(res, { points: trend.map(toDailyTrendPointDto) });
  },
};
