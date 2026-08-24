import { env } from '../config/env';

const envelope = (dataSchema: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    meta: { type: 'object' },
  },
});

const errorResponse = {
  description: 'Error response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
          requestId: { type: 'string' },
        },
      },
    },
  },
};

function jsonBody(schema: Record<string, unknown>) {
  return { content: { 'application/json': { schema } } };
}

function okResponse(description: string, dataSchema: Record<string, unknown> = {}) {
  return { description, content: { 'application/json': { schema: envelope(dataSchema) } } };
}

const security = [{ bearerAuth: [] }];
const commonErrors = {
  '400': errorResponse,
  '401': errorResponse,
  '403': errorResponse,
  '404': errorResponse,
  '409': errorResponse,
  '429': errorResponse,
};

function op(summary: string, opts: { auth?: boolean; body?: Record<string, unknown>; tags: string[] } = { tags: [] }) {
  return {
    summary,
    tags: opts.tags,
    ...(opts.auth === false ? {} : { security }),
    ...(opts.body ? { requestBody: jsonBody(opts.body) } : {}),
    responses: {
      '200': okResponse('Success'),
      ...commonErrors,
    },
  };
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Routiva API',
    version: '1.0.0',
    description:
      'Personal schedule, activity tracking, reminders, and analytics platform. All endpoints are versioned under /api/v1.',
  },
  servers: [{ url: `http://localhost:${env.PORT}/api/v1` }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  tags: [
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Categories' },
    { name: 'Activities' },
    { name: 'Schedules' },
    { name: 'Tracking' },
    { name: 'Notifications' },
    { name: 'Reports' },
  ],
  paths: {
    '/auth/register': { post: op('Register a new user', { auth: false, tags: ['Auth'], body: { type: 'object' } }) },
    '/auth/login': { post: op('Log in with email/password', { auth: false, tags: ['Auth'], body: { type: 'object' } }) },
    '/auth/refresh': { post: op('Rotate the refresh session and issue a new access token', { auth: false, tags: ['Auth'] }) },
    '/auth/logout': { post: op('Revoke the current refresh session', { auth: false, tags: ['Auth'] }) },
    '/auth/logout-all': { post: op('Revoke all refresh sessions for the user', { tags: ['Auth'] }) },
    '/auth/forgot-password': {
      post: op('Request a password reset (always returns a generic response)', { auth: false, tags: ['Auth'], body: { type: 'object' } }),
    },
    '/auth/reset-password': {
      post: op('Reset password using a valid reset token', { auth: false, tags: ['Auth'], body: { type: 'object' } }),
    },
    '/auth/me': { get: op('Get the authenticated user', { tags: ['Auth'] }) },

    '/users/me': {
      get: op('Get current user profile', { tags: ['Users'] }),
      patch: op('Update current user profile (name, timezone)', { tags: ['Users'], body: { type: 'object' } }),
    },

    '/categories': {
      get: op('List categories owned by the user', { tags: ['Categories'] }),
      post: op('Create a category', { tags: ['Categories'], body: { type: 'object' } }),
    },
    '/categories/{id}': {
      patch: op('Update a category', { tags: ['Categories'], body: { type: 'object' } }),
      delete: op('Deactivate a category (soft delete)', { tags: ['Categories'] }),
    },

    '/activities': {
      get: op('List activities owned by the user', { tags: ['Activities'] }),
      post: op('Create an activity', { tags: ['Activities'], body: { type: 'object' } }),
    },
    '/activities/{id}': {
      get: op('Get an activity', { tags: ['Activities'] }),
      patch: op('Update an activity', { tags: ['Activities'], body: { type: 'object' } }),
      delete: op('Archive an activity (historical logs are preserved)', { tags: ['Activities'] }),
    },

    '/schedules': {
      get: op('List recurring schedule entries', { tags: ['Schedules'] }),
      post: op('Create a recurring/one-time schedule entry (409 on conflict unless override=true)', {
        tags: ['Schedules'],
        body: { type: 'object' },
      }),
    },
    '/schedules/today': { get: op("Render and materialize today's effective schedule", { tags: ['Schedules'] }) },
    '/schedules/date/{date}': { get: op('Render and materialize the effective schedule for a date', { tags: ['Schedules'] }) },
    '/schedules/{id}': {
      get: op('Get a schedule entry', { tags: ['Schedules'] }),
      patch: op('Update a schedule entry (scope: ONLY | FUTURE | ALL)', { tags: ['Schedules'], body: { type: 'object' } }),
      delete: op('Archive a schedule entry', { tags: ['Schedules'] }),
    },
    '/schedules/exceptions': {
      post: op('Create a date-specific exception (MOVE/SKIP/ADD/REPLACE)', { tags: ['Schedules'], body: { type: 'object' } }),
    },
    '/schedules/exceptions/{id}': {
      patch: op('Update an exception', { tags: ['Schedules'], body: { type: 'object' } }),
      delete: op('Delete an exception', { tags: ['Schedules'] }),
    },

    '/activity-logs': { get: op('List activity logs with filters (from/to or date, status, activityId)', { tags: ['Tracking'] }) },
    '/activity-logs/summary/daily': { get: op("Get a day's tracking summary", { tags: ['Tracking'] }) },
    '/activity-logs/{id}': {
      get: op('Get an activity log', { tags: ['Tracking'] }),
      patch: op('Correct actual start/end/notes on a log', { tags: ['Tracking'], body: { type: 'object' } }),
    },
    '/activity-logs/{id}/start': { post: op('Start an activity (idempotent)', { tags: ['Tracking'] }) },
    '/activity-logs/{id}/complete': { post: op('Complete an activity (idempotent)', { tags: ['Tracking'] }) },
    '/activity-logs/{id}/skip': { post: op('Skip an activity (idempotent)', { tags: ['Tracking'] }) },

    '/notifications/preferences': {
      get: op('Get notification preferences', { tags: ['Notifications'] }),
      patch: op('Update notification preferences (quiet hours, default offset)', { tags: ['Notifications'], body: { type: 'object' } }),
    },
    '/notifications/push/subscribe': {
      post: op('Register a Web Push subscription', { tags: ['Notifications'], body: { type: 'object' } }),
      delete: op('Remove a Web Push subscription', { tags: ['Notifications'], body: { type: 'object' } }),
    },

    '/reports/summary': { get: op('Summary metrics for a date range', { tags: ['Reports'] }) },
    '/reports/categories': { get: op('Category totals for a date range', { tags: ['Reports'] }) },
    '/reports/activities': { get: op('Per-activity totals for a date range', { tags: ['Reports'] }) },
    '/reports/daily-trend': { get: op('One data point per day for a date range', { tags: ['Reports'] }) },
  },
};
