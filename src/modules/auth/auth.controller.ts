import { Request, Response } from 'express';
import { AppError } from '../../common/errors/AppError';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { authService } from './auth.service';
import { setRefreshCookie, clearRefreshCookie } from './cookie.util';
import { env } from '../../config/env';
import type { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.validation';

function requestMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}

export const authController = {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body as RegisterInput);
    sendCreated(res, { user });
  },

  async login(req: Request, res: Response) {
    const { user, tokens } = await authService.login(req.body as LoginInput, requestMeta(req));
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
    sendSuccess(res, {
      user,
      accessToken: tokens.accessToken,
      accessTokenExpiresInMinutes: env.JWT_ACCESS_TTL_MINUTES,
    });
  },

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
    if (!refreshToken) {
      throw AppError.authRequired('No refresh session present');
    }
    const { user, tokens } = await authService.refresh(refreshToken, requestMeta(req));
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
    sendSuccess(res, {
      user,
      accessToken: tokens.accessToken,
      accessTokenExpiresInMinutes: env.JWT_ACCESS_TTL_MINUTES,
    });
  },

  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
    await authService.logout(refreshToken);
    clearRefreshCookie(res);
    sendSuccess(res, { loggedOut: true });
  },

  async logoutAll(req: Request, res: Response) {
    await authService.logoutAll(req.userId as string);
    clearRefreshCookie(res);
    sendSuccess(res, { loggedOut: true });
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body as ForgotPasswordInput;
    await authService.forgotPassword(email);
    sendSuccess(res, { message: 'If an account exists for this email, a reset link has been sent.' });
  },

  async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = req.body as ResetPasswordInput;
    await authService.resetPassword(token, newPassword);
    sendSuccess(res, { message: 'Password has been reset. Please log in again.' });
  },

  async me(req: Request, res: Response) {
    const user = await authService.me(req.userId as string);
    sendSuccess(res, { user });
  },
};
