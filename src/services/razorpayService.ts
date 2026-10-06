/**
 * Seamless, Lag-Free Razorpay Integration Service
 * Connects frontend with backend /api/razorpay/* endpoints.
 */

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface PaymentVerificationResponse {
  success: boolean;
  message?: string;
  error?: string;
  paymentId?: string;
}

export const razorpayService = {
  /**
   * Ensure Razorpay script is loaded
   */
  async loadScript(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (window.Razorpay) return true;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },

  /**
   * Create order via backend API
   */
  async createOrder(params: {
    amountRupees: number;
    points: number;
    packageId: string;
    userId: string;
    userEmail: string;
    studioName?: string;
  }): Promise<RazorpayOrderResponse> {
    const res = await fetch('/api/razorpay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with status ${res.status}`);
    }

    return await res.json();
  },

  /**
   * Verify cryptographic payment signature via backend API
   */
  async verifyPayment(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<PaymentVerificationResponse> {
    const res = await fetch('/api/razorpay/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    return await res.json();
  },

  /**
   * Start 1-Click Razorpay Payment Checkout
   */
  async startCheckout(options: {
    amountRupees: number;
    points: number;
    packageName: string;
    packageId: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone: string;
    studioName?: string;
    onSuccess: (paymentId: string, orderId: string) => void;
    onError: (errorMessage: string) => void;
  }) {
    const isLoaded = await this.loadScript();
    if (!isLoaded || !window.Razorpay) {
      options.onError('Failed to load Razorpay payment gateway SDK. Please check your internet connection.');
      return;
    }

    try {
      // 1. Create order on server
      const order = await this.createOrder({
        amountRupees: options.amountRupees,
        points: options.points,
        packageId: options.packageId,
        userId: options.userId,
        userEmail: options.userEmail,
        studioName: options.studioName,
      });

      // 2. Configure Razorpay modal
      const rzpOptions = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: options.studioName || 'NEPOLIAN CINEMATIC STUDIO',
        description: `${options.packageName} (${options.points} Event Credits)`,
        order_id: order.orderId,
        prefill: {
          name: options.userName,
          email: options.userEmail,
          contact: options.userPhone.replace(/[^0-9]/g, '').slice(-10),
        },
        notes: {
          packageId: options.packageId,
          points: String(options.points),
          studioName: options.studioName || '',
        },
        theme: {
          color: '#f59e0b', // Luxury Golden Amber
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            console.log('Payment modal dismissed by user');
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // 3. Cryptographically verify payment on server
            const verification = await razorpayService.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verification.success) {
              options.onSuccess(response.razorpay_payment_id, response.razorpay_order_id);
            } else {
              options.onError(verification.error || 'Payment signature verification failed.');
            }
          } catch (err: any) {
            options.onError(err.message || 'Error occurred while verifying payment.');
          }
        },
      };

      const paymentObject = new window.Razorpay(rzpOptions);

      paymentObject.on('payment.failed', (response: any) => {
        const errorDesc = response.error?.description || response.error?.reason || 'Payment failed';
        options.onError(`Payment Failed: ${errorDesc}`);
      });

      paymentObject.open();
    } catch (err: any) {
      options.onError(err.message || 'Unable to initiate payment with Razorpay');
    }
  },
};
