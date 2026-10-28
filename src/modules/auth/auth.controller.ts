import { Request, Response, NextFunction } from 'express';
import { AuthService, authService as defaultAuthService } from './auth.service';

export class AuthController {
  private authService: AuthService;

  constructor(service: AuthService = defaultAuthService) {
    this.authService = service;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.authService.register(req.body);
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: user
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body);
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // req.user is guaranteed by authenticate middleware
      const userId = req.user!.id;
      const user = await this.authService.getMe(userId);
      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
