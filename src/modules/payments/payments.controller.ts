import { Request, Response, NextFunction } from 'express';
import {
  PaymentsService,
  paymentsService as defaultPaymentsService
} from './payments.service';

export class PaymentsController {
  private paymentsService: PaymentsService;

  constructor(service: PaymentsService = defaultPaymentsService) {
    this.paymentsService = service;
  }

  initiatePayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.paymentsService.initiatePayment(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Payment initiated successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  getPaymentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.paymentsService.getPaymentById(
        req.params.id as string,
        req.user!
      );
      res.status(200).json({
        success: true,
        data: payment
      });
    } catch (error) {
      next(error);
    }
  };

  processWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signatureHeader =
        (req.headers['x-payment-signature'] as string) ||
        (req.headers['x-razorpay-signature'] as string) ||
        (req.headers['stripe-signature'] as string);

      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

      const result = await this.paymentsService.processWebhook(
        rawBody,
        signatureHeader,
        req.body
      );

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  };
}

export const paymentsController = new PaymentsController();
