import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity.js';
import { PAYMENT_PROVIDERS } from './payment-provider.js';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { CodService } from './providers/cod.service.js';
import { RazorpayService } from './providers/razorpay.service.js';
import { StripeService } from './providers/stripe.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentController],
  providers: [
    RazorpayService,
    StripeService,
    CodService,
    {
      // Register new providers here.
      provide: PAYMENT_PROVIDERS,
      useFactory: (...providers: unknown[]) => providers,
      inject: [RazorpayService, StripeService, CodService],
    },
    PaymentService,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
